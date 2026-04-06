import type { DietaryFlag, DietaryFlags } from "../../server/storage.js";
import { searchWeb, fetchPageText } from "./http.js";

const GF_CONFIRMED = /\b(?:gluten[\s-]?free|gf|celiac[\s-]?friendly)\b/i;
const VEGAN_CONFIRMED = /\b(?:vegan)\b/i;
const VEG_CONFIRMED = /\b(?:vegetarian|veggie|plant[\s-]?based)\b/i;

const GF_INFERRED =
  /\b(?:cauliflower crust|rice flour|gluten[\s-]?free option|can be made gf)\b/i;
const VEGAN_INFERRED =
  /\b(?:dairy[\s-]?free|no animal|vegan option|can be made vegan)\b/i;
const VEG_INFERRED =
  /\b(?:meatless|meat[\s-]?free|vegetable[\s-]?forward|vegetarian option)\b/i;

export function extractUrls(html: string): string[] {
  const pattern = /href="(https?:\/\/[^"]+)"/gi;
  const urls: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

function menuUrlScore(url: string): number {
  const normalized = url.toLowerCase();
  if (normalized.includes("/menu")) return 10;
  if (normalized.includes("yelp.com")) return 5;
  if (normalized.includes("google.com/maps")) return 3;
  return 1;
}

export async function findMenuUrls(restaurantName: string): Promise<string[]> {
  const queries = [
    `"${restaurantName}" menu San Francisco`,
    `"${restaurantName}" San Francisco site:yelp.com`,
  ];
  const allUrls: string[] = [];

  for (const query of queries) {
    try {
      allUrls.push(...extractUrls(await searchWeb(query)));
    } catch {
      // Skip failed search results.
    }
  }

  const seen = new Set<string>();
  const filtered = allUrls.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    if (url.includes("duckduckgo.com")) return false;
    if (url.includes("google.com/search")) return false;
    return true;
  });

  return filtered.sort((a, b) => menuUrlScore(b) - menuUrlScore(a));
}

function checkDietary(
  confirmedRe: RegExp,
  inferredRe: RegExp,
  text: string,
): DietaryFlag {
  if (confirmedRe.test(text)) {
    return { available: true, confidence: "confirmed" };
  }
  if (inferredRe.test(text)) return { available: true, confidence: "inferred" };
  return { available: false, confidence: "inferred" };
}

export function parseDietaryFlags(text: string): DietaryFlags {
  return {
    gluten_free: checkDietary(GF_CONFIRMED, GF_INFERRED, text),
    vegan: checkDietary(VEGAN_CONFIRMED, VEGAN_INFERRED, text),
    vegetarian: checkDietary(VEG_CONFIRMED, VEG_INFERRED, text),
  };
}

export async function discoverMenu(restaurantName: string): Promise<{
  menuUrl: string | null;
  dietaryFlags: DietaryFlags;
}> {
  const defaultFlags: DietaryFlags = {
    gluten_free: { available: false, confidence: "inferred" },
    vegan: { available: false, confidence: "inferred" },
    vegetarian: { available: false, confidence: "inferred" },
  };
  const urls = await findMenuUrls(restaurantName);
  if (urls.length === 0) return { menuUrl: null, dietaryFlags: defaultFlags };

  const menuSignals =
    /\b(?:menu|appetizer|entr[eé]e|dessert|salad|soup|pizza|pasta|burger|sandwich|bowl|plate|\$\d)\b/i;

  for (const url of urls.slice(0, 3)) {
    const text = await fetchPageText(url);
    if (text.length < 50) continue;
    if (!menuSignals.test(text)) continue;

    return {
      menuUrl: url,
      dietaryFlags: parseDietaryFlags(text),
    };
  }

  return { menuUrl: urls[0] ?? null, dietaryFlags: defaultFlags };
}
