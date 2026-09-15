// A scripted `services.inference` for unit tests: the AI SDK's real generateText/streamText on its test
// model, so results, steps, `output` parsing, tool execution and stream parts behave as in the app.
// `ai` loads on the first call, so @abuddy/sdk/testing loads in packs that don't install it.
import { createInferenceService, type InferenceService } from '../services/inference.ts';
import { parseModelId, type ModelId } from '../services/models.ts';

/** A model call the code under test made */
export interface FakeInferenceCall {
  model: ModelId;
  /** The system prompt (`instructions`), if any */
  instructions?: string;
  /** The conversation the model received: each message's text, tool calls and results as JSON */
  messages: Array<{ role: 'user' | 'assistant' | 'tool'; text: string }>;
  /** Names of the tools the model was offered */
  tools: string[];
  /** Whether `streamText` made the call */
  stream: boolean;
}

/** What the model answers a call with: text, or tool calls (the AI SDK runs them and calls again while `stopWhen` allows) */
export type FakeInferenceReply = string | { text?: string; toolCalls?: Array<{ toolName: string; input: unknown }> };

export interface FakeInference extends InferenceService {
  /** Every model call so far, in order: one per step */
  readonly calls: readonly FakeInferenceCall[];
}

type MockModelOptions = NonNullable<ConstructorParameters<typeof import('ai/test').MockLanguageModelV4>[0]>;
type CallOptions = Parameters<Extract<MockModelOptions['doGenerate'], (...args: never[]) => unknown>>[0];
type PromptPart = { type: string; text?: string; toolName?: string; input?: unknown; output?: unknown };

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

function partText(part: PromptPart): string {
  if (part.type === 'text' || part.type === 'reasoning') return part.text ?? '';
  if (part.type === 'tool-call') return JSON.stringify({ toolName: part.toolName, input: part.input });
  if (part.type === 'tool-result') return JSON.stringify(part.output);
  return '';
}

function toCall(model: ModelId, options: CallOptions, stream: boolean): FakeInferenceCall {
  const instructions = options.prompt.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const messages: FakeInferenceCall['messages'] = [];
  for (const message of options.prompt) {
    if (message.role === 'system') continue;
    messages.push({ role: message.role, text: (message.content as PromptPart[]).map(partText).join('') });
  }
  return {
    model,
    ...(instructions && { instructions }),
    messages,
    tools: (options.tools ?? []).map((tool) => tool.name),
    stream,
  };
}

/**
 * A `services.inference` whose model answers every call with `reply`, or what `reply` returns for
 * the call. Tests mock `services.inference` with it through `mockInference` (@abuddy/testing/harness).
 */
export function fakeInference(reply: FakeInferenceReply | ((call: FakeInferenceCall) => FakeInferenceReply)): FakeInference {
  const calls: FakeInferenceCall[] = [];
  let toolCallCount = 0;

  const answer = (model: ModelId, options: CallOptions, stream: boolean) => {
    const call = toCall(model, options, stream);
    calls.push(call);
    const result = typeof reply === 'function' ? reply(call) : reply;
    const { text = '', toolCalls = [] } = typeof result === 'string' ? { text: result } : result;
    return {
      text,
      toolCalls: toolCalls.map((toolCall) => ({ type: 'tool-call' as const, toolCallId: `call-${++toolCallCount}`, toolName: toolCall.toolName, input: JSON.stringify(toolCall.input) })),
      finishReason: { unified: toolCalls.length > 0 ? 'tool-calls' as const : 'stop' as const, raw: undefined },
    };
  };

  const modelFor = async (model: ModelId) => {
    const { MockLanguageModelV4, simulateReadableStream } = await import('ai/test');
    const parts = parseModelId(model);
    return new MockLanguageModelV4({
      provider: parts?.provider,
      modelId: parts?.model ?? model,
      doGenerate: async (options) => {
        const { text, toolCalls, finishReason } = answer(model, options, false);
        return { content: [...(text ? [{ type: 'text' as const, text }] : []), ...toolCalls], finishReason, usage: USAGE, warnings: [] };
      },
      doStream: async (options) => {
        const { text, toolCalls, finishReason } = answer(model, options, true);
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start' as const, warnings: [] },
              ...(text ? [{ type: 'text-start' as const, id: 'text-1' }, { type: 'text-delta' as const, id: 'text-1', delta: text }, { type: 'text-end' as const, id: 'text-1' }] : []),
              ...toolCalls,
              { type: 'finish' as const, finishReason, usage: USAGE },
            ],
            initialDelayInMs: null,
            chunkDelayInMs: null,
          }),
        };
      },
    });
  };

  return { calls, ...createInferenceService(modelFor) };
}
