import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import type { ZodType } from 'zod'
import type { LLMClient } from '../types.js'

export function createOpenAIClient(
  apiKey: string,
  defaultModel: string,
): LLMClient {
  const client = new OpenAI({ apiKey })

  return {
    async extractStructured<T>(options: {
      schema: ZodType<T>
      prompt: string
      text: string
      model?: string
    }): Promise<T> {
      const model = options.model ?? defaultModel
      const response = await client.chat.completions.parse({
        model,
        messages: [
          { role: 'system', content: options.prompt },
          { role: 'user', content: options.text },
        ],
        response_format: zodResponseFormat(options.schema, 'extraction'),
      })

      const parsed = response.choices[0]?.message?.parsed
      if (!parsed) {
        throw new Error('OpenAI returned no parsed structured output')
      }
      return parsed
    },
  }
}
