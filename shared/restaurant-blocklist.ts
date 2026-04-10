const BLOCKED_RESTAURANT_NAMES = new Set([
  'insider tip',
  'take note',
  'what to order',
])

function normalizeRestaurantBlocklistKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function isBlockedRestaurantName(name: string): boolean {
  return BLOCKED_RESTAURANT_NAMES.has(normalizeRestaurantBlocklistKey(name))
}
