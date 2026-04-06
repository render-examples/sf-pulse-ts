export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

export function escapeHtml(value: string): string {
  return value
    .replace(
      /&(?!(?:[a-zA-Z][a-zA-Z0-9]+|#\d+|#x[a-fA-F0-9]+);)/g,
      "&amp;",
    )
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function stripParsingNoiseHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(?:script|style|svg|noscript|nav|footer)\b[\s\S]*?<\/(?:script|style|svg|noscript|nav|footer)>/gi,
      " ",
    );
}
