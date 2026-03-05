import type { ActionMeta, Services, Z } from '../types';

export const meta: ActionMeta = {
  label: 'db query',
  description: 'Generates database operations from natural language prompts using LLM classification',
  category: 'database',
  input: {
    dbPrompt: {
      type: 'string',
      description: 'Natural language prompt describing the database operation',
      required: true,
      placeholder: 'e.g. Show me all threads created this week',
    },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  const { dbPrompt } = params;

  try {
    services.emitter.sendToPlugin('database', { type: 'MAGIC_PROMPT_LOADING' });

    // Get documents from library service
    const [doc1, doc2] = await Promise.all([
      services.library.getDocByCode('DOC-1'),
      services.library.getDocByCode('DOC-2')
    ]);

    services.logger.info('db example docs', { dbPrompt, doc1, doc2 })

    // Check if documents were found
    if (!doc1) {
      throw new Error('Document DOC-1 not found');
    }
    if (!doc2) {
      throw new Error('Document DOC-2 not found');
    }

    const queryDoc = doc1.content;
    const transactionDoc = doc2.content;

    const queryExamples = queryDoc[0]?.text || 'No content found in DOC-1';
    const transactionExamples = transactionDoc[0]?.text || 'No content found in DOC-2';

    // Define schema for message classification
    const MessageClassificationSchema = z.object({
      type: z.enum(['query', 'transaction']).describe('Whether the message is a read operation (query) or write operation (transaction)'),
    });

    // Classify the user's message
    const classificationResult = await services.llm.generateObject({
      model: { provider: 'openai', model: 'gpt-5-nano-2025-08-07' },
      schema: MessageClassificationSchema,
      "reasoning_effort": "minimal",
      prompt: services.prompt.usePrompt('db-query-classification')({
        queryExamples,
        transactionExamples,
        dbPrompt
      }),
      temperature: 0.3,
    });

    services.logger.info('classificationResult', classificationResult)
    const classification = classificationResult.object;

    const queryPrompt = queryDoc[1]?.text || '';
    const transactionPrompt = transactionDoc[1]?.text || '';

    // Select appropriate document based on classification
    const selectedDoc = classification.type === 'query' ? queryPrompt : transactionPrompt;

    services.logger.info('Message classified', {
      type: classification.type,
    });

    // Generate the database operation code
    const result = await services.llm.generateText({
      model: {
        provider: 'openai', model: 'gpt-5-nano-2025-08-07',
      },
      "reasoning_effort": "minimal",
      prompt: dbPrompt,
      system: services.prompt.usePrompt('db-query-examples')({
        selectedDoc
      }),
      temperature: 0.7,
      maxTokens: 1000,
    });

    // Emit the generated code to database plugin
    services.emitter.sendToPlugin('database', {
      type: 'MAGIC_PROMPT_GENERATED',
      query: result.text
    });

  } catch (error) {
    services.logger.error('Error generating database operation', { error });

    services.emitter.sendToPlugin('database', {
      type: 'QUERY_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}
