import type {
  DeepPartial, embed, embedMany, EmbeddingModel, FlexibleSchema, generateImage, generateSpeech, generateText, ImageModel, InferSchema,
  LanguageModel, Output, OutputInterface, SpeechModel, streamText, ToolLoopAgent, ToolLoopAgentSettings, ToolSet, transcribe, TranscriptionModel,
} from 'ai';
import { hostService } from './host-services.ts';
import type { EmbeddingModelId, ImageModelId, ModelId, ModelIdOf, ModelKind, SpeechModelId, TranscriptionModelId } from './models.ts';

/** The runtime context type `ai` calls take (`runtimeContext`) */
type RuntimeContext = Parameters<typeof generateText>[0] extends { runtimeContext?: infer C } ? C : never;

interface OutputNaming {
  /** Guides the provider (a tool or schema name) */
  name?: string;
  description?: string;
}

/**
 * Structured output as data: what `Output.text`, `.json`, `.object`, `.array` and `.choice` from `ai`
 * take, with the kind named by `type`. Code that can't import `ai` (actions) and stored settings use it;
 * an `Output` from `ai` works in its place.
 */
export type OutputSpec =
  | { type: 'text' }
  | ({ type: 'json' } & OutputNaming)
  | ({ type: 'object'; schema: FlexibleSchema<unknown> } & OutputNaming)
  | ({ type: 'array'; element: FlexibleSchema<unknown>; minItems?: number; maxItems?: number } & OutputNaming)
  | ({ type: 'choice'; options: readonly string[] } & OutputNaming);

/** The AI SDK `Output` an `output` option stands for: itself, or the one its spec builds */
export type OutputOf<O> =
  O extends OutputInterface ? O :
  O extends { type: 'object'; schema: infer S } ? OutputInterface<InferSchema<S>, DeepPartial<InferSchema<S>>, never> :
  O extends { type: 'array'; element: infer S } ? OutputInterface<InferSchema<S>[], InferSchema<S>[], InferSchema<S>> :
  O extends { type: 'choice'; options: readonly (infer C extends string)[] } ? OutputInterface<C, C, never> :
  O extends { type: 'json' } ? ReturnType<typeof Output.json> :
  ReturnType<typeof Output.text>;

/** An AI SDK call's options, with `model` named by id */
type WithModelId<Options, Id> = Omit<Options, 'model'> & { model: Id };

/** An AI SDK call's options, with `model` named by id and `output` as an `Output` or its spec */
type InferenceOptions<Options, O> = Omit<Options, 'model' | 'output'> & { model: ModelId; output?: O };

/** @internal The AI SDK model of each kind */
export interface InferenceModels {
  language: LanguageModel;
  embedding: EmbeddingModel;
  image: ImageModel;
  speech: SpeechModel;
  transcription: TranscriptionModel;
}

/**
 * Model calls with the user's provider keys. The options and results are the AI SDK's (`ai`), with
 * `model` given as a `provider:model` id and `output` as an `Output` from `ai` or an {@link OutputSpec}.
 * Import `tool`, `Output`, `isStepCount` and types from `ai`. The host implements it.
 */
export interface InferenceService {
  /** The AI SDK's `generateText`: text, structured `output`, and tool loops (`tools`, `stopWhen`) */
  generateText<TOOLS extends ToolSet = {}, CONTEXT extends RuntimeContext = RuntimeContext, const O extends OutputInterface | OutputSpec = OutputInterface<string, string>>(
    options: InferenceOptions<Parameters<typeof generateText<TOOLS, CONTEXT, OutputOf<O>>>[0], O>,
  ): ReturnType<typeof generateText<TOOLS, CONTEXT, OutputOf<O>>>;
  /** The AI SDK's `streamText`: read `stream` (parts), `textStream`, `partialOutputStream`, or the final `text` */
  streamText<TOOLS extends ToolSet = {}, CONTEXT extends RuntimeContext = RuntimeContext, const O extends OutputInterface | OutputSpec = OutputInterface<string, string, never>>(
    options: InferenceOptions<Parameters<typeof streamText<TOOLS, CONTEXT, OutputOf<O>>>[0], O>,
  ): Promise<ReturnType<typeof streamText<TOOLS, CONTEXT, OutputOf<O>>>>;
  /** The AI SDK's `ToolLoopAgent`: `generate` and `stream` run `instructions`, `tools` and `output` in a loop until `stopWhen` (20 steps by default) */
  createAgent<CALL_OPTIONS = never, TOOLS extends ToolSet = {}, CONTEXT extends RuntimeContext = RuntimeContext, const O extends OutputInterface | OutputSpec = never>(
    settings: InferenceOptions<ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, CONTEXT, OutputOf<O>>, O>,
  ): Promise<ToolLoopAgent<CALL_OPTIONS, TOOLS, CONTEXT, OutputOf<O>>>;
  /** The AI SDK's `embed`: one value's `embedding` */
  embed(options: WithModelId<Parameters<typeof embed>[0], EmbeddingModelId>): ReturnType<typeof embed>;
  /** The AI SDK's `embedMany`: `embeddings` for `values`, in order */
  embedMany(options: WithModelId<Parameters<typeof embedMany>[0], EmbeddingModelId>): ReturnType<typeof embedMany>;
  /** The AI SDK's `generateImage`: `image` (and `images`) for a `prompt` */
  generateImage(options: WithModelId<Parameters<typeof generateImage>[0], ImageModelId>): ReturnType<typeof generateImage>;
  /** The AI SDK's `generateSpeech`: `audio` for `text` */
  generateSpeech(options: WithModelId<Parameters<typeof generateSpeech>[0], SpeechModelId>): ReturnType<typeof generateSpeech>;
  /** The AI SDK's `transcribe`: `text` and `segments` for `audio` */
  transcribe(options: WithModelId<Parameters<typeof transcribe>[0], TranscriptionModelId>): ReturnType<typeof transcribe>;
}

/** The `Output` an `output` option stands for: an `Output` passes through, a spec builds its `Output.*` */
async function toAiOutput(output: OutputInterface | OutputSpec | undefined): Promise<OutputInterface | undefined> {
  // Every Output implements parseCompleteOutput; a spec is plain data
  if (output === undefined || 'parseCompleteOutput' in output) return output;
  const { Output } = await import('ai');
  switch (output.type) {
    case 'text': return Output.text();
    case 'json': return Output.json(output);
    case 'object': return Output.object(output);
    case 'array': return Output.array(output);
    case 'choice': return Output.choice({ ...output, options: [...output.options] });
  }
}

/** @internal A model of a kind, for an id naming a provider that gives it */
export type ResolveModel = <K extends ModelKind>(kind: K, id: ModelIdOf<K>) => InferenceModels[K] | Promise<InferenceModels[K]>;

/**
 * @internal An {@link InferenceService} that runs the AI SDK on the models `resolveModel` gives for ids:
 * the host's implementation and `fakeInference`. `ai` loads on the first call.
 */
export function createInferenceService(resolveModel: ResolveModel): InferenceService {
  return {
    async generateText({ model, output, ...options }) {
      const { generateText } = await import('ai');
      return generateText({ ...options, output: await toAiOutput(output), model: await resolveModel('language', model) } as Parameters<typeof generateText>[0]) as never;
    },
    async streamText({ model, output, ...options }) {
      const { streamText } = await import('ai');
      return streamText({ ...options, output: await toAiOutput(output), model: await resolveModel('language', model) } as Parameters<typeof streamText>[0]) as never;
    },
    async createAgent({ model, output, ...settings }) {
      const { ToolLoopAgent } = await import('ai');
      return new ToolLoopAgent({ ...settings, output: await toAiOutput(output), model: await resolveModel('language', model) } as ConstructorParameters<typeof ToolLoopAgent>[0]) as never;
    },
    async embed({ model, ...options }) {
      const { embed } = await import('ai');
      return embed({ ...options, model: await resolveModel('embedding', model) });
    },
    async embedMany({ model, ...options }) {
      const { embedMany } = await import('ai');
      return embedMany({ ...options, model: await resolveModel('embedding', model) });
    },
    async generateImage({ model, ...options }) {
      const { generateImage } = await import('ai');
      return generateImage({ ...options, model: await resolveModel('image', model) });
    },
    async generateSpeech({ model, ...options }) {
      const { generateSpeech } = await import('ai');
      return generateSpeech({ ...options, model: await resolveModel('speech', model) });
    },
    async transcribe({ model, ...options }) {
      const { transcribe } = await import('ai');
      return transcribe({ ...options, model: await resolveModel('transcription', model) });
    },
  };
}

const host = () => hostService('inference');

/** The host's implementation, registered under `inference` */
export const inference: InferenceService = {
  generateText: (options) => host().generateText(options),
  streamText: (options) => host().streamText(options),
  createAgent: (settings) => host().createAgent(settings),
  embed: (options) => host().embed(options),
  embedMany: (options) => host().embedMany(options),
  generateImage: (options) => host().generateImage(options),
  generateSpeech: (options) => host().generateSpeech(options),
  transcribe: (options) => host().transcribe(options),
};
