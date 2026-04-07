export interface RestaurantIdentityInput {
  name: string
  address?: string | null
  neighborhood?: string | null
}

function normalizeIdentityPart(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function buildRestaurantIdentityKey({
  name,
  address,
  neighborhood,
}: RestaurantIdentityInput): string {
  return [
    normalizeIdentityPart(name),
    normalizeIdentityPart(address) || normalizeIdentityPart(neighborhood),
  ].join('|')
}
