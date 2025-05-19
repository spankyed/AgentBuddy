import OpenAI from 'openai';
import { agent, type agentSystem } from '../system';
import { type ActorRefFrom, fromPromise } from 'xstate';
import { handleOpenAIStream } from './openai-stream-handler';

type LLMProvider = 'openai' | 'anthropic' | 'google';
export type StreamHandler<T, R> = (event: T, callback: (content: string) => void) => R;
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function message(role: 'user' | 'assistant' | 'system', content: string): ChatMessage {
  return { role, content };
}

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
function getStreamHandler(provider: LLMProvider): StreamHandler<any, boolean> {
  // Factory function to get the appropriate stream handler based on provider
  switch (provider) {
    case 'openai':
      return handleOpenAIStream;
    // Add more providers as needed
    // case 'anthropic':
    //   return handleAnthropicStream;
    // case 'google':
    //   return handleGoogleStream;
    default:
      return handleOpenAIStream;
  }
}

// Main chat stream function
export const chatStream = fromPromise<void, { messages: ChatMessage[], provider?: LLMProvider }>(async ({ input, system }) => {
  const agentSys = system.get(agent) as ActorRefFrom<typeof agentSystem>;
  const provider = input.provider || 'openai';

  if (!input.messages) {
    throw new Error('No messages provided');
  } 
  if (!agentSys) {
    throw new Error('No agent system found');
  }

  // Get the appropriate stream handler
  const streamHandler = getStreamHandler(provider);

  // Create the stream based on provider
  const stream = await openai.responses.create({
    model: "gpt-4.1",
    // instructions: '',
    input: input.messages,
    stream: true,
  });

  // Process the stream
  for await (const event of stream) {
    // console.log(event);
    
    streamHandler(event, (content) => {
      agentSys.send({
        type: 'TOKEN_STREAM',
        token: content
      });
    });
  }

  agentSys.send({
    type: 'LLM_DONE'
  });
})
