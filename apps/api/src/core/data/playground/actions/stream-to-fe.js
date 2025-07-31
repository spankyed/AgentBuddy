import { z } from 'zod';
import Services from '@/services';

export async function streamToFE(params, services) {
const { text, threadId } = params.message;

const result = await services.llm.streamText({
  model: { provider: 'openai', model: 'gpt-4o' },
  prompt: text,
  system: 'You are a helpful assistant.',
  temperature: 0.7,
  maxTokens: 100,
});

for await (const textPart of result.textStream) {
  services.logger.info('Streaming text to FE', { textPart });

  services.emitter.sendToPlugin('agent', {
    type: 'TOKEN_STREAM',
    token: textPart
  });
}

await result.finishReason
  
const addResult = services.repository.agentCommands.addMessage({
  threadId,
  text: await result.text,
  sender: 'assistant'
});

services.emitter.sendToPlugin('agent', {
  type: 'LLM_DONE',
});
}