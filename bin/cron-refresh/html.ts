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
