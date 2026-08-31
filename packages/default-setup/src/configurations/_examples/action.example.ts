/**
 * Example action — reference for writing new actions.
 *
 * Demonstrates: meta definition, LLM calls (generateText + generateObject),
 * prompt templates, zod schemas, service usage, and error handling.
 */
import type { ActionMeta, Services, Z } from '../types';

export const meta: ActionMeta = {
  label: 'Analyze Text',
  description: 'Summarizes text and classifies its intent using prompt templates',
  category: 'analysis',
  input: {
    text: {
      type: 'string',
      description: 'The text to analyze',
      required: true,
      placeholder: 'e.g. I need help setting up my account',
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

  // --- Prompt templates ---
  // usePrompt renders a compiled prompt template with parameters.
  // Always pass both arguments: label + params object.
  const summaryPrompt = services.prompt.usePrompt('Summarize Text', {
    text,
    maxSentences: 2,
  });

  if (!summaryPrompt) {
    throw new Error('Prompt "Summarize Text" not found');
  }

  // --- Plain text generation ---
  const summaryResult = await services.llm.generateText({
    model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    prompt: summaryPrompt,
  });

  // --- Structured output with zod schema ---
  const ClassificationSchema = z.object({
    intent: z.string(),
    confidence: z.number(),
  });

  const classifyPrompt = services.prompt.usePrompt('Classify Intent', {
    message: text,
    categories: ['question', 'request', 'feedback'],
  });

  const classifyResult = await services.llm.generateObject({
    model: { provider: 'openai', model: 'gpt-4o' },
    schema: ClassificationSchema,
    prompt: classifyPrompt || text,
  });

  const classification = classifyResult.object as { intent: string; confidence: number };

  // --- Logging ---
  services.logger.info('Analysis complete', {
    summary: summaryResult.text,
    classification,
  });

  // --- Emit to frontend plugin ---
  // services.emitter.sendToPlugin('pluginName', { type: 'EVENT_TYPE', data });

  return {
    summary: summaryResult.text,
    intent: classification.intent,
    confidence: classification.confidence,
  };
}
