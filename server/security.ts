import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { InitialData } from "../client/src/types";

const TRUSTED_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "notify.windows.com",
]);

const TRUSTED_PUSH_HOST_SUFFIXES = [
  ".push.apple.com",
  ".notify.windows.com",
];

function normalizeAppUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Public app URL must use http or https");
  }

  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");

  return url.toString().replace(/\/$/, "");
}

function isTrustedPushHost(hostname: string): boolean {
  return (
    TRUSTED_PUSH_HOSTS.has(hostname) ||
    TRUSTED_PUSH_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .min(1)
    .max(2048)
    .refine(isTrustedPushEndpoint, "Push endpoint must use a trusted web-push provider"),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }).strict(),
}).strict();

const unsubscribeSchema = z.object({
  endpoint: z
    .string()
    .min(1)
    .max(2048)
    .refine(isTrustedPushEndpoint, "Push endpoint must use a trusted web-push provider"),
}).strict();

export function getPublicAppUrl(): string {
  const explicitUrl = process.env.APP_URL?.trim();
  if (explicitUrl) {
    return normalizeAppUrl(explicitUrl);
  }

  const renderUrl = process.env.RENDER_EXTERNAL_URL?.trim();
  if (renderUrl) {
    return normalizeAppUrl(renderUrl);
  }

  if (process.env.NODE_ENV === "production") {
    const error = new Error("APP_URL or RENDER_EXTERNAL_URL must be configured in production");
    Object.assign(error, { status: 503 });
    throw error;
  }

  return `http://127.0.0.1:${process.env.PORT || "5000"}`;
}

export function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function renderInitialDataScript(data: InitialData): string {
  return `<script>window.__INITIAL_DATA__ = ${serializeForInlineScript(data)};</script>`;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function getVapidConfig(): VapidConfig {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();

  if (publicKey && privateKey) {
    return {
      publicKey,
      privateKey,
      subject: "mailto:sf-pulse@example.com",
    };
  }

  const error = new Error(
    process.env.NODE_ENV === "production"
      ? "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured"
      : "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured in the local environment (for example via .env.local)",
  );
  Object.assign(error, { status: 503 });
  throw error;
}

export function getVapidPublicKey(): string {
  return getVapidConfig().publicKey;
}

export function secretsEqual(expected: string, actual: unknown): boolean {
  if (typeof actual !== "string") return false;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function isTrustedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password) {
      return false;
    }

    return isTrustedPushHost(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function parsePushSubscriptionBody(body: unknown) {
  return pushSubscriptionSchema.safeParse(body);
}

export function parsePushUnsubscribeBody(body: unknown) {
  return unsubscribeSchema.safeParse(body);
}
