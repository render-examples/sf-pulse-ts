import type { ZodType } from 'zod'

export interface LLMClient {
  extractStructured<T>(options: {
    schema: ZodType<T>
    prompt: string
    text: string
    model?: string
  }): Promise<T>
}

export type ProviderConfig = {
  provider: 'openai' | 'anthropic'
  apiKey: string
  model?: string
}

export interface RawArticle {
  source: 'eater' | 'funcheap' | 'famsf' | 'calacademy' | 'ddg'
  url: string
  title: string
  pubDate: string | null
  bodyText: string
  jsonLd?: unknown
}

export interface RawMenuPage {
  restaurantName: string
  restaurantId: number
  menuUrl: string
  text: string
  currentCuisine: string
}
