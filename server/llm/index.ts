import type { LLMClient, ProviderConfig } from './types.js'
import { createOpenAIClient } from './providers/openai.js'
import { createAnthropicClient } from './providers/anthropic.js'

export type { LLMClient, ProviderConfig, RawArticle, RawMenuPage } from './types.js'
export { extractStructured } from './extract.js'

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
}

export function createLLMClient(config: ProviderConfig): LLMClient {
  const model = config.model ?? DEFAULT_MODELS[config.provider] ?? 'gpt-4o-mini'

  switch (config.provider) {
    case 'openai':
      return createOpenAIClient(config.apiKey, model)
    case 'anthropic':
      return createAnthropicClient(config.apiKey, model)
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`)
  }
}

export function createLLMClientFromEnv(): LLMClient | null {
  const apiKey = process.env.LLM_API_KEY
  if (!apiKey) return null

  const provider = (process.env.LLM_PROVIDER ?? 'openai') as 'openai' | 'anthropic'
  const model = process.env.LLM_MODEL

  return createLLMClient({ provider, apiKey, model })
}
