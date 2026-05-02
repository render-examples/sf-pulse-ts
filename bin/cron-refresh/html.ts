import {
  decodeHtmlEntities,
  decodeHtmlEntitiesRecursive,
  escapeHtml,
  normalizeEscapedHtmlText,
  normalizeWhitespace,
} from "../../shared/html.ts";

export { decodeHtmlEntities, decodeHtmlEntitiesRecursive, escapeHtml, normalizeEscapedHtmlText, normalizeWhitespace };

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

export function stripParsingNoiseHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(?:script|style|svg|noscript|nav|footer)\b[\s\S]*?<\/(?:script|style|svg|noscript|nav|footer)>/gi,
      " ",
    );
}

const BODY_TEXT_LIMIT = 8_000

export function extractBodyText(html: string): string {
  const cleaned = stripParsingNoiseHtml(html)

  const semanticMatch = cleaned.match(
    /<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i,
  )
  const content = semanticMatch ? semanticMatch[1] : cleaned

  return stripHtml(content).slice(0, BODY_TEXT_LIMIT)
}
