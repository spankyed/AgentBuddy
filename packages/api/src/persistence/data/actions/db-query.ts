// @ts-nocheck
import Services from '@/services';
import { z } from 'zod';

/**
 * Name: db query
 */
export async function dbQuery(params: any, services: typeof Services) {
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
      // reasoning: z.string().describe('Brief explanation of why this classification was chosen')
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
      // reasoning: classification.reasoning
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

    // Emit error to database plugin - note: this event type might not exist
    // You may need to handle errors differently based on your system
    services.emitter.sendToPlugin('database', {
      type: 'QUERY_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}