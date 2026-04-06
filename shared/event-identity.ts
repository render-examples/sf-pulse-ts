export interface EventIdentityInput {
  title: string;
  location: string;
  dateText: string;
}

function normalizeIdentityPart(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function buildEventIdentityKey({
  title,
  location,
  dateText,
}: EventIdentityInput): string {
  return [
    normalizeIdentityPart(title),
    normalizeIdentityPart(location),
    normalizeIdentityPart(dateText),
  ].join("|");
}
