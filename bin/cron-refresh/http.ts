import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { CRON_USER_AGENT } from "./constants.js";
import { stripHtml } from "./html.js";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

interface LookupAddress {
  address: string;
  family: number;
}

type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

let lookupOverride: LookupFn | null = null;

const defaultLookup: LookupFn = async (hostname) =>
  lookupOverride
    ? lookupOverride(hostname)
    : lookup(hostname, { all: true, verbatim: true });

export function setLookupOverrideForTests(lookupFn: LookupFn | null): void {
  lookupOverride = lookupFn;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !isPrivateIpv4(address);
  if (family === 6) {
    const mappedIpv4 = address.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (mappedIpv4) return !isPrivateIpv4(mappedIpv4);
    return !isPrivateIpv6(address);
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

export async function assertSafeFetchTarget(
  value: string,
  lookupFn: LookupFn = defaultLookup,
): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Outbound fetch target must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("Outbound fetch target must not include credentials");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error("Outbound fetch target hostname is blocked");
  }

  if (isIP(url.hostname)) {
    if (!isPublicIpAddress(url.hostname)) {
      throw new Error("Outbound fetch target must resolve to a public IP");
    }
    return url;
  }

  const addresses = await lookupFn(url.hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error("Outbound fetch target must resolve to public IPs");
  }

  return url;
}

export async function searchWeb(q: string): Promise<string> {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    {
      headers: { "User-Agent": CRON_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  return res.ok ? res.text() : "";
}

export async function fetchPageHtml(url: string): Promise<string> {
  try {
    let currentUrl = await assertSafeFetchTarget(url);

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const res = await fetch(currentUrl, {
        headers: { "User-Agent": CRON_USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "manual",
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return "";
        currentUrl = await assertSafeFetchTarget(
          new URL(location, currentUrl).toString(),
        );
        continue;
      }

      if (!res.ok) return "";
      return res.text();
    }

    return "";
  } catch {
    return "";
  }
}

export async function fetchPageText(url: string): Promise<string> {
  const html = await fetchPageHtml(url);
  return html ? stripHtml(html) : "";
}
