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

  // Generate a summary using the 'Summarize Text' prompt template
  const summaryPrompt = services.prompt.usePrompt('Summarize Text', {
    text,
    maxSentences: 2,
  });

  if (!summaryPrompt) {
    throw new Error('Prompt "Summarize Text" not found — import compiled-prompts.json first');
  }

  const summaryResult = await services.llm.generateText({
    model: { provider: 'openai', model: 'gpt-4o' },
    prompt: summaryPrompt,
  });

  // Classify the intent using the 'Classify Intent' prompt template
  const classifyPrompt = services.prompt.usePrompt('Classify Intent', {
    message: text,
    categories: ['question', 'request', 'feedback', 'complaint'],
  });

  if (!classifyPrompt) {
    throw new Error('Prompt "Classify Intent" not found — import compiled-prompts.json first');
  }

  const ClassificationSchema = z.object({
    intent: z.string(),
    confidence: z.number(),
  });

  const classifyResult = await services.llm.generateObject({
    model: { provider: 'openai', model: 'gpt-4o' },
    schema: ClassificationSchema,
    prompt: classifyPrompt,
  });

  const classification = classifyResult.object as { intent: string; confidence: number };

  services.logger.info('Text analysis complete', {
    summary: summaryResult.text,
    classification,
  });

  return {
    summary: summaryResult.text,
    intent: classification.intent,
    confidence: classification.confidence,
  };
}
