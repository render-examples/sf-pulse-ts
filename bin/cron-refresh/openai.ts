import OpenAI from 'openai'
import type { DietaryFlags } from '../../server/storage.js'
import type { NewRestaurant } from './types.js'
import { stripHtml } from './html.js'

const DIETARY_FLAGS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    gluten_free: {
      type: 'object',
      properties: {
        available: { type: 'boolean' },
        confidence: { type: 'string', enum: ['confirmed', 'inferred'] },
      },
      required: ['available', 'confidence'],
      additionalProperties: false,
    },
    vegan: {
      type: 'object',
      properties: {
        available: { type: 'boolean' },
        confidence: { type: 'string', enum: ['confirmed', 'inferred'] },
      },
      required: ['available', 'confidence'],
      additionalProperties: false,
    },
    vegetarian: {
      type: 'object',
      properties: {
        available: { type: 'boolean' },
        confidence: { type: 'string', enum: ['confirmed', 'inferred'] },
      },
      required: ['available', 'confidence'],
      additionalProperties: false,
    },
  },
  required: ['gluten_free', 'vegan', 'vegetarian'],
  additionalProperties: false,
}

const RESTAURANTS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    restaurants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          neighborhood: { type: 'string' },
          cuisine: { type: 'string' },
          address: { type: ['string', 'null'] },
          opened_date: { type: 'string' },
        },
        required: ['name', 'neighborhood', 'cuisine', 'address', 'opened_date'],
        additionalProperties: false,
      },
    },
  },
  required: ['restaurants'],
  additionalProperties: false,
}

let _client: OpenAI | undefined
let _testClient: { chat: OpenAI['chat'] } | undefined

export function setOpenAIClientForTests(
  client: { chat: OpenAI['chat'] } | undefined,
): void {
  _testClient = client
}

function getClient(): { chat: OpenAI['chat'] } {
  if (_testClient !== undefined) return _testClient
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is required for menu and article parsing. ' +
        'Add it to .env.local. See docs/openai-api-permissions.md for the minimal permissions needed.',
    )
  }
  if (!_client) _client = new OpenAI()
  return _client
}

export async function parseDietaryFlagsWithAI(
  menuText: string,
): Promise<DietaryFlags> {
  const client = getClient()
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content:
          'Analyze this menu text and identify available dietary options. ' +
          'Use "confirmed" confidence when the option is explicitly labeled (e.g., "vegan", "gluten-free"), ' +
          '"inferred" when implied (e.g., "dairy-free" implies vegan-friendly).\n\nMenu:\n' +
          menuText.slice(0, 4000),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'dietary_flags',
        schema: DIETARY_FLAGS_SCHEMA,
        strict: true,
      },
    },
  })

  const content = response.choices[0]?.message?.content
  if (!content)
    throw new Error('OpenAI returned empty response for dietary flag parsing')
  return JSON.parse(content) as DietaryFlags
}

export async function parseEaterArticleWithAI(
  html: string,
  existing: string[],
  sourceUrl: string | null,
  openedDate: string,
): Promise<NewRestaurant[]> {
  const client = getClient()
  const text = stripHtml(html).slice(0, 6000)

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content:
          `Extract all newly opened or opening-soon San Francisco restaurant mentions from this article. ` +
          `For each restaurant provide its name, SF neighborhood, cuisine type, street address (null if not mentioned), ` +
          `and opening date (use "${openedDate}" if not specified). ` +
          `Only include SF restaurants. Skip these already-known names: ${existing.slice(0, 20).join(', ')}.\n\nArticle:\n${text}`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'restaurants',
        schema: RESTAURANTS_SCHEMA,
        strict: true,
      },
    },
  })

  const content = response.choices[0]?.message?.content
  if (!content)
    throw new Error('OpenAI returned empty response for article parsing')

  const parsed = JSON.parse(content) as {
    restaurants: Array<{
      name: string
      neighborhood: string
      cuisine: string
      address: string | null
      opened_date: string
    }>
  }

  const existingLower = new Set(existing.map((n) => n.toLowerCase()))
  return parsed.restaurants
    .filter((r) => r.name && !existingLower.has(r.name.toLowerCase()))
    .map((r) => ({
      name: r.name,
      neighborhood: r.neighborhood || 'San Francisco',
      cuisine: r.cuisine || 'Restaurant',
      address: r.address,
      opened_date: r.opened_date || openedDate,
      source_url: sourceUrl,
      highlight_kind: 'opening' as const,
    }))
}
