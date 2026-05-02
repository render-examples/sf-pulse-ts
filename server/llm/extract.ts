import type { ZodType } from 'zod'
import type { LLMClient } from './types.js'

export async function extractStructured<T>(
  client: LLMClient,
  options: {
    schema: ZodType<T>
    prompt: string
    text: string
    model?: string
  },
): Promise<T | null> {
  try {
    return await client.extractStructured(options)
  } catch (firstError) {
    console.warn('[llm] extraction failed, retrying with simplified prompt:', firstError)
    try {
      return await client.extractStructured({
        ...options,
        prompt: `${options.prompt}\n\nRespond with valid JSON matching the schema. Be concise.`,
      })
    } catch (retryError) {
      console.warn('[llm] retry also failed, skipping:', retryError)
      return null
    }
  }
}
