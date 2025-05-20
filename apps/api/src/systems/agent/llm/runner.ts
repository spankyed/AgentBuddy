import OpenAI from 'openai';
import { agent, type agentSystem } from '../system';
import { type ActorRefFrom, fromPromise } from 'xstate';
import { handleOpenAIStream } from './openai-stream-handler';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type LLMProvider = 'openai'; // add more when implemented

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export const message = (
  role: ChatMessage['role'],
  content = '',
): ChatMessage => ({ role, content });

type StreamCallback = (content: string) => void;
export type StreamHandler<E> = (event: E, cb: StreamCallback) => void;

/* ------------------------------------------------------------------ */
/* Provider registry                                                  */
/* ------------------------------------------------------------------ */

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_API_KEY });

// Define a mapping from provider name to its specific stream event type
interface ProviderStreamEventMap {
  openai: OpenAI.Responses.ResponseStreamEvent;
  // anthropic: AnthropicStreamEvent; // TODO: add when implemented
  // google: GoogleStreamEvent;       // TODO: add when implemented
}

// Enforce that every provider has a correctly-typed handler
const streamHandlers: { [P in keyof ProviderStreamEventMap]: StreamHandler<ProviderStreamEventMap[P]> } = {
  openai: handleOpenAIStream,
  // anthropic: handleAnthropicStream,
  // google:   handleGoogleStream,
};

// Helper to retrieve a handler while preserving its precise event type
function getStreamHandler<P extends keyof ProviderStreamEventMap>(
  provider: P,
): StreamHandler<ProviderStreamEventMap[P]> {
  return streamHandlers[provider];
}

/* ------------------------------------------------------------------ */
/* Main stream actor                                                  */
/* ------------------------------------------------------------------ */

export const chatStream = fromPromise<void, { messages: ChatMessage[], provider?: LLMProvider }>(async ({ input, system, signal: abortSignal }) => {
  if (!input.messages?.length) throw new Error('messages array is required');

  const agentRef = system.get(agent) as ActorRefFrom<typeof agentSystem>;
  if (!agentRef) throw new Error('agent system missing');

  const { provider = 'openai' } = input;

  if (abortSignal.aborted) {
    agentRef.send({ type: 'LLM_ABORTED' });
    return;
  }

  const streamHandler = getStreamHandler(provider);

  const stream = await openai.responses.create(
    {
      model: 'gpt-4.1',
      // instructions: '',
      input: input.messages,
      stream: true,
    },
    { signal: abortSignal },
  );

  let aborted = false;
  const onAbort = () => {
    aborted = true;
    agentRef.send({ type: 'LLM_ABORTED' });
  };
  abortSignal.addEventListener('abort', onAbort, { once: true });

  try {
    for await (const event of stream) {
      if (aborted) break;
      streamHandler(event, (token) =>
        agentRef.send({ type: 'TOKEN_STREAM', token }),
      );
    }

    if (!aborted) agentRef.send({ type: 'LLM_DONE' });
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || aborted)) {
      agentRef.send({ type: 'LLM_ABORTED' });
    } else {
      agentRef.send({ type: 'LLM_ERROR', error: err });
      throw err;
    }
    // throw err;
  } finally {
    abortSignal.removeEventListener('abort', onAbort);
  }
});