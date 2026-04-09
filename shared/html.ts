const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeNumericHtmlEntity(entity: string): string | null {
  const hexMatch = entity.match(/^#x([0-9a-f]+)$/i);
  if (hexMatch) {
    const codePoint = Number.parseInt(hexMatch[1], 16);
    return Number.isNaN(codePoint) ? null : String.fromCodePoint(codePoint);
  }

  const decimalMatch = entity.match(/^#(\d+)$/);
  if (!decimalMatch) {
    return null;
  }

  const codePoint = Number.parseInt(decimalMatch[1], 10);
  return Number.isNaN(codePoint) ? null : String.fromCodePoint(codePoint);
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&([a-zA-Z][a-zA-Z0-9]+|#\d+|#x[0-9a-fA-F]+);/g, (match, entity) => {
    const named = NAMED_HTML_ENTITIES[entity.toLowerCase()];
    if (named !== undefined) {
      return named;
    }

    return decodeNumericHtmlEntity(entity) ?? match;
  });
}

export function decodeHtmlEntitiesRecursive(value: string): string {
  let current = value;

  for (let index = 0; index < 5; index += 1) {
    const next = decodeHtmlEntities(current);
    if (next === current) {
      break;
    }
    current = next;
  }

  return current;
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

export function normalizeEscapedHtmlText(value: string): string {
  return escapeHtml(
    normalizeWhitespace(
      decodeHtmlEntitiesRecursive(value).replace(/\u00a0/g, " "),
    ),
  );
}
