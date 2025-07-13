import { EARS } from '@/core/types';
import type { ActionEntity } from '@/systems/actions/types';
import { tidyFunction } from '@/core/utils/tidy-function';

const nowMs = Date.now();

const actionFn = tidyFunction(`
  const { message } = params;

  const result = services.llm.streamText({
    model: { provider: 'openai', model: 'gpt-4o' },
    prompt: message,
    system: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 100,
  });

  for await (const textPart of result.textStream) {
    services.logger.info('Streaming text to FE', { textPart });
  }
`);

export const streamToFEAction: ActionEntity = {
  id: 'Action-stream-to-fe',
  entityType: EARS.Entity.Action,
  createdAt: nowMs - 70,
  label: 'Stream to FE',
  description: 'Streams a message to the front-end',
  category: 'utility',
  input: {
    message: {
      name: 'message',
      type: 'string' as const,
      required: true,
      description: 'User message'
    },
  },
  actionFn,
  output: { logged: 'boolean', message: 'string' },
  updatedAt: nowMs - 70
};