/**
 * Example action — this file is excluded from compilation (.example.ts).
 * Use as a reference when writing new actions.
 */
import type { ActionMeta, Services, Z } from '../types';

export const meta: ActionMeta = {
  label: 'Example Action',
  description: 'Demonstrates the action authoring pattern',
  category: 'examples',
  input: {
    text: {
      type: 'string',
      description: 'Input text to process',
      required: true,
    },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  const { text } = params;

  // Use the LLM service
  const result = await services.llm.generateText({
    model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    prompt: `Summarize: ${text}`,
  });

  // Use the prompt service (correct 2-arg call)
  const rendered = services.prompt.usePrompt('Summarize Text', {
    text,
    maxSentences: 2,
  });

  // Emit result to a frontend plugin
  services.emitter.sendToPlugin('agent', {
    type: 'EXAMPLE_RESULT',
    data: result.text,
  });
}
