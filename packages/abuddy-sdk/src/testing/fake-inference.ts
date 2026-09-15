// A scripted `services.inference` for unit tests: the AI SDK's real calls on its test models, so results, steps,
// `output` parsing, tool execution, agents and stream parts behave as in the app. `ai` loads on the first call, so
// @abuddy/sdk/testing loads in packs that don't install it.
import { createInferenceService, type InferenceService, type ResolveModel } from '../services/inference.ts';
import { parseModelId, type EmbeddingModelId, type ImageModelId, type ModelId, type ModelKind, type RerankingModelId, type SpeechModelId, type TranscriptionModelId } from '../services/models.ts';

/** A language model call the code under test made (`generateText`, `streamText`, an agent's step) */
export interface FakeTextCall {
  kind: 'text';
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

/**
 * A model call the code under test made. The AI SDK splits some calls into several model calls, as it does for a
 * real provider: `embedMany` into chunks of 2048 values, `generateImage` into batches of up to 10 images.
 */
export type FakeInferenceCall =
  | FakeTextCall
  | { kind: 'embedding'; model: EmbeddingModelId; values: string[] }
  | { kind: 'image'; model: ImageModelId; prompt?: string; n: number; size?: string; aspectRatio?: string }
  | { kind: 'speech'; model: SpeechModelId; text: string; voice?: string; instructions?: string; speed?: number }
  | { kind: 'transcription'; model: TranscriptionModelId; mediaType: string }
  | { kind: 'reranking'; model: RerankingModelId; query: string; documents: unknown[]; topN?: number };

/** What the language model answers a call with: text, or tool calls (the AI SDK runs them and calls again while `stopWhen` allows) */
export type FakeInferenceReply = string | { text?: string; toolCalls?: Array<{ toolName: string; input: unknown }> };

/** What the other kinds of model answer with */
export interface FakeInferenceReplies {
  /** Each embedded value's vector (default `[value.length, 1, 0]`) */
  embedding?: (value: string) => number[];
  /** Each generated image's bytes (default a 1×1 PNG) */
  image?: Uint8Array;
  /** The generated audio's bytes (default a silent MP3 frame) */
  speech?: Uint8Array;
  /** The transcript (default `'Fake transcript'`) */
  transcript?: string;
  /** Each document's relevance to the query, from 0 to 1 (default: earlier documents rank higher) */
  relevance?: (query: string, document: unknown, index: number) => number;
}

export interface FakeInference extends InferenceService {
  /** Every model call so far, in order: one per step for text */
  readonly calls: readonly FakeInferenceCall[];
}

type MockModelOptions = NonNullable<ConstructorParameters<typeof import('ai/test').MockLanguageModelV4>[0]>;
type CallOptions = Parameters<Extract<MockModelOptions['doGenerate'], (...args: never[]) => unknown>>[0];
type PromptPart = { type: string; text?: string; toolName?: string; input?: unknown; output?: unknown };

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};
const bytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
const PNG = bytes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
/** One silent MPEG-1 Layer III frame (128 kbps, 44.1 kHz): what providers return as `audio/mpeg` */
const MP3 = Uint8Array.from({ length: 417 }, (_, index) => [0xff, 0xfb, 0x90, 0x64][index] ?? 0);

function partText(part: PromptPart): string {
  if (part.type === 'text' || part.type === 'reasoning') return part.text ?? '';
  if (part.type === 'tool-call') return JSON.stringify({ toolName: part.toolName, input: part.input });
  if (part.type === 'tool-result') return JSON.stringify(part.output);
  return '';
}

function toCall(model: ModelId, options: CallOptions, stream: boolean): FakeTextCall {
  const instructions = options.prompt.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const messages: FakeTextCall['messages'] = [];
  for (const message of options.prompt) {
    if (message.role === 'system') continue;
    messages.push({ role: message.role, text: (message.content as PromptPart[]).map(partText).join('') });
  }
  return {
    kind: 'text',
    model,
    ...(instructions && { instructions }),
    messages,
    tools: (options.tools ?? []).map((tool) => tool.name),
    stream,
  };
}

/**
 * A `services.inference` whose language model answers every call with `reply` (or what `reply` returns for the
 * call), and whose other models answer with `replies`. Tests mock `services.inference` with it through
 * `mockInference` (@abuddy/testing/harness).
 */
export function fakeInference(
  reply: FakeInferenceReply | ((call: FakeTextCall) => FakeInferenceReply),
  {
    embedding = (value) => [value.length, 1, 0], image = PNG, speech = MP3, transcript = 'Fake transcript',
    relevance = (_query, _document, index) => 1 / (index + 1),
  }: FakeInferenceReplies = {},
): FakeInference {
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

  const modelFor = (async (kind: ModelKind, id: string): Promise<unknown> => {
    const mocks = await import('ai/test');
    const parts = parseModelId(id);
    const names = { provider: parts?.provider, modelId: parts?.model ?? id };
    const response = { timestamp: new Date(0), modelId: names.modelId, headers: undefined };
    switch (kind) {
      case 'language': return languageModel(mocks, id as ModelId, names) as never;
      case 'embedding': return new mocks.MockEmbeddingModelV4({ ...names, maxEmbeddingsPerCall: 2048, doEmbed: async ({ values }) => {
        calls.push({ kind: 'embedding', model: id as EmbeddingModelId, values });
        return { embeddings: values.map(embedding), warnings: [] };
      } }) as never;
      case 'image': return new mocks.MockImageModelV4({ ...names, maxImagesPerCall: 10, doGenerate: async ({ prompt, n, size, aspectRatio }) => {
        calls.push({ kind: 'image', model: id as ImageModelId, ...(prompt !== undefined && { prompt }), n, ...(size && { size }), ...(aspectRatio && { aspectRatio }) });
        return { images: Array.from({ length: n }, () => image), warnings: [], response };
      } }) as never;
      case 'speech': return new mocks.MockSpeechModelV4({ ...names, doGenerate: async ({ text, voice, instructions, speed }) => {
        calls.push({ kind: 'speech', model: id as SpeechModelId, text, ...(voice !== undefined && { voice }), ...(instructions !== undefined && { instructions }), ...(speed !== undefined && { speed }) });
        return { audio: speech, warnings: [], response };
      } }) as never;
      case 'reranking': return new mocks.MockRerankingModelV4({ ...names, doRerank: async ({ query, documents, topN }) => {
        calls.push({ kind: 'reranking', model: id as RerankingModelId, query, documents: documents.values, ...(topN !== undefined && { topN }) });
        const ranking = documents.values.map((document, index) => ({ index, relevanceScore: relevance(query, document, index) }))
          .sort((a, b) => b.relevanceScore - a.relevanceScore);
        return { ranking: topN === undefined ? ranking : ranking.slice(0, topN), response };
      } }) as never;
      default: return new mocks.MockTranscriptionModelV4({ ...names, doGenerate: async ({ mediaType }) => {
        calls.push({ kind: 'transcription', model: id as TranscriptionModelId, mediaType });
        return { text: transcript, segments: [], language: undefined, durationInSeconds: undefined, warnings: [], response };
      } }) as never;
    }
  }) as ResolveModel;

  const languageModel = (mocks: typeof import('ai/test'), model: ModelId, names: { provider?: string; modelId: string }) => {
    const { MockLanguageModelV4, simulateReadableStream } = mocks;
    return new MockLanguageModelV4({
      ...names,
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
