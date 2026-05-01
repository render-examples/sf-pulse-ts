import Anthropic from '@anthropic-ai/sdk'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ZodType } from 'zod'
import type { LLMClient } from '../types.js'

export function createAnthropicClient(
  apiKey: string,
  defaultModel: string,
): LLMClient {
  const client = new Anthropic({ apiKey })

  return {
    async extractStructured<T>(options: {
      schema: ZodType<T>
      prompt: string
      text: string
      model?: string
    }): Promise<T> {
      const model = options.model ?? defaultModel
      const jsonSchema = zodToJsonSchema(options.schema, {
        target: 'openApi3',
      })

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: options.prompt,
        messages: [{ role: 'user', content: options.text }],
        tools: [
          {
            name: 'extraction',
            description: 'Extract structured data from the text',
            input_schema: jsonSchema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'extraction' },
      })

      const toolBlock = response.content.find(
        (block): block is Anthropic.ToolUseBlock =>
          block.type === 'tool_use',
      )
      if (!toolBlock) {
        throw new Error('Anthropic returned no tool use block')
      }

      return options.schema.parse(toolBlock.input)
    },
  }
}
