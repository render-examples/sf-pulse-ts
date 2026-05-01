import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDietaryFlagsWithAI,
  parseEaterArticleWithAI,
  setOpenAIClientForTests,
} from './openai.js'

// Minimal mock shape — only the surface we actually call
type FakeCreate = () => Promise<{ choices: [{ message: { content: string } }] }>
type FakeClient = { chat: { completions: { create: FakeCreate } } }

function fakeClient(content: string): FakeClient {
  return {
    chat: {
      completions: { create: async () => ({ choices: [{ message: { content } }] }) },
    },
  }
}

describe('parseDietaryFlagsWithAI()', () => {
  afterEach(() => setOpenAIClientForTests(undefined))

  it('throws with actionable message when OPENAI_API_KEY is not set', async () => {
    const saved = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      await assert.rejects(
        () => parseDietaryFlagsWithAI('menu text'),
        /OPENAI_API_KEY is required/,
      )
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved
    }
  })

  it('returns parsed DietaryFlags from AI response', async () => {
    const flags = {
      gluten_free: { available: true, confidence: 'confirmed' },
      vegan: { available: false, confidence: 'inferred' },
      vegetarian: { available: true, confidence: 'confirmed' },
    }
    setOpenAIClientForTests(fakeClient(JSON.stringify(flags)))
    const result = await parseDietaryFlagsWithAI('Gluten-free pasta. Vegetarian Pad Thai.')
    assert.deepEqual(result, flags)
  })

  it('throws on empty response content', async () => {
    setOpenAIClientForTests({
      chat: { completions: { create: async () => ({ choices: [{ message: { content: '' } }] }) } },
    })
    await assert.rejects(
      () => parseDietaryFlagsWithAI('menu'),
      /empty response/,
    )
  })

  it('propagates API errors without swallowing them', async () => {
    setOpenAIClientForTests({
      chat: { completions: { create: async () => { throw new Error('rate limit') } } },
    })
    await assert.rejects(() => parseDietaryFlagsWithAI('menu'), /rate limit/)
  })
})

describe('parseEaterArticleWithAI()', () => {
  afterEach(() => setOpenAIClientForTests(undefined))

  it('throws with actionable message when OPENAI_API_KEY is not set', async () => {
    const saved = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      await assert.rejects(
        () => parseEaterArticleWithAI('<h1>Test</h1>', [], null, 'January 2024'),
        /OPENAI_API_KEY is required/,
      )
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved
    }
  })

  it('returns mapped NewRestaurant array from AI response', async () => {
    const payload = {
      restaurants: [
        {
          name: 'Taqueria El Sol',
          neighborhood: 'Mission',
          cuisine: 'Mexican',
          address: '123 Valencia St',
          opened_date: 'January 2024',
        },
      ],
    }
    setOpenAIClientForTests(fakeClient(JSON.stringify(payload)))
    const results = await parseEaterArticleWithAI(
      '<h1>New Taqueria</h1>',
      [],
      'https://sf.eater.com/article',
      'January 2024',
    )
    assert.equal(results.length, 1)
    assert.equal(results[0].name, 'Taqueria El Sol')
    assert.equal(results[0].neighborhood, 'Mission')
    assert.equal(results[0].source_url, 'https://sf.eater.com/article')
    assert.equal(results[0].highlight_kind, 'opening')
  })

  it('filters out names already in the existing list (case-insensitive)', async () => {
    const payload = {
      restaurants: [
        { name: 'Known Place', neighborhood: 'SOMA', cuisine: 'American', address: null, opened_date: 'January 2024' },
        { name: 'New Spot', neighborhood: 'Mission', cuisine: 'Italian', address: null, opened_date: 'January 2024' },
      ],
    }
    setOpenAIClientForTests(fakeClient(JSON.stringify(payload)))
    const results = await parseEaterArticleWithAI('<html/>', ['known place'], null, 'January 2024')
    assert.equal(results.length, 1)
    assert.equal(results[0].name, 'New Spot')
  })

  it('returns empty array when AI finds no restaurants', async () => {
    setOpenAIClientForTests(fakeClient(JSON.stringify({ restaurants: [] })))
    const results = await parseEaterArticleWithAI('<html/>', [], null, 'January 2024')
    assert.deepEqual(results, [])
  })

  it('propagates API errors without swallowing them', async () => {
    setOpenAIClientForTests({
      chat: { completions: { create: async () => { throw new Error('timeout') } } },
    })
    await assert.rejects(
      () => parseEaterArticleWithAI('<html/>', [], null, 'January 2024'),
      /timeout/,
    )
  })
})
