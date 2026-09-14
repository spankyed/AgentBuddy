// A scripted model for unit tests: registered as the "model-provider" host module, so inference
// (`@abuddy/sdk/inference`) runs the AI SDK against it instead of a provider.
import { registerHostModule } from '../runtime/host.ts';
import type { ModelConfig } from '../services/inference.ts';

/** A call the code under test made to the model */
export interface FakeModelCall {
  /** The model the code asked for */
  model: ModelConfig;
  system?: string;
  /** The conversation after the system prompt: each message's text (tool results as JSON) */
  messages: Array<{ role: 'user' | 'assistant' | 'tool'; text: string }>;
  /** The names of the tools the model was offered */
  tools: string[];
  /** Whether the call streamed */
  stream: boolean;
}

/** A tool call the fake model makes */
export interface FakeToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

/** What the fake model answers: text, or text and tool calls */
export type FakeModelReply = string | { text?: string; toolCalls?: FakeToolCall[]; finishReason?: 'stop' | 'length' | 'tool-calls' };

export interface FakeModel {
  /** Every call so far, in order */
  readonly calls: readonly FakeModelCall[];
}

type Part = { type: string; text?: string; toolName?: string; args?: unknown; result?: unknown };
type PromptMessage = { role: string; content: string | Part[] };
type CallOptions = { prompt: PromptMessage[]; mode?: { type: string; tools?: Array<{ name: string }> } };

function partText(part: Part): string {
  if (part.type === 'text' || part.type === 'reasoning') return part.text ?? '';
  if (part.type === 'tool-call') return JSON.stringify({ toolName: part.toolName, args: part.args });
  if (part.type === 'tool-result') return JSON.stringify(part.result);
  return '';
}

function toCall(model: ModelConfig, options: CallOptions, stream: boolean): FakeModelCall {
  const system = options.prompt.filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n');
  return {
    model,
    ...(system && { system }),
    messages: options.prompt
      .filter((m): m is PromptMessage & { role: FakeModelCall['messages'][number]['role'] } => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
      .map((m) => ({ role: m.role, text: typeof m.content === 'string' ? m.content : m.content.map(partText).join('') })),
    tools: options.mode?.tools?.map((t) => t.name) ?? [],
    stream,
  };
}

const USAGE = { promptTokens: 0, completionTokens: 0 };

const noModel = {
  languageModel(): never {
    throw new Error('No model in unit tests: call fakeModel() from @abuddy/sdk/testing to script its replies');
  },
  webSearchTool(): never {
    throw new Error('No model in unit tests: call fakeModel() from @abuddy/sdk/testing to script its replies');
  },
};

/** @internal The test host's model provider until a test scripts one; the harness restores it after each test */
export function restoreModelProvider(): void {
  registerHostModule('model-provider', noModel);
}

/**
 * Scripts the model inference uses for the rest of the test: every call gets `reply` (or what the
 * function returns for the call), and is recorded in `calls`. Tool calls in a reply run the code's
 * tools like a real model's would.
 */
export function fakeModel(reply: FakeModelReply | ((call: FakeModelCall) => FakeModelReply | Promise<FakeModelReply>)): FakeModel {
  const calls: FakeModelCall[] = [];
  let toolCallCount = 0;

  const answer = async (config: ModelConfig, options: CallOptions, stream: boolean) => {
    const call = toCall(config, options, stream);
    calls.push(call);
    const result = typeof reply === 'function' ? await reply(call) : reply;
    const { text = '', toolCalls = [], finishReason } = typeof result === 'string' ? { text: result } : result;
    return {
      text,
      toolCalls: toolCalls.map((tc) => ({ toolCallType: 'function' as const, toolCallId: `call-${++toolCallCount}`, toolName: tc.toolName, args: JSON.stringify(tc.args) })),
      finishReason: finishReason ?? (toolCalls.length > 0 ? 'tool-calls' : 'stop'),
    };
  };

  const provider = {
    languageModel: (config: ModelConfig) => ({
      specificationVersion: 'v1',
      provider: 'fake',
      modelId: config.model,
      defaultObjectGenerationMode: 'json',
      doGenerate: async (options: CallOptions) => ({
        ...(await answer(config, options, false)),
        usage: USAGE,
        rawCall: { rawPrompt: options.prompt, rawSettings: {} },
      }),
      doStream: async (options: CallOptions) => {
        const { text, toolCalls, finishReason } = await answer(config, options, true);
        const parts = [
          ...(text ? [{ type: 'text-delta', textDelta: text }] : []),
          ...toolCalls.map((tc) => ({ type: 'tool-call', ...tc })),
          { type: 'finish', finishReason, usage: USAGE },
        ];
        return {
          stream: new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); } }),
          rawCall: { rawPrompt: options.prompt, rawSettings: {} },
        };
      },
    }),
    webSearchTool: () => ({ type: 'provider-defined', id: 'openai.web_search_preview', args: {} }),
  };
  registerHostModule('model-provider', provider);
  return { calls };
}
