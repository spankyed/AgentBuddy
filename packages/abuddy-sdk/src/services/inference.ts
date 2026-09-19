import type {
  DeepPartial, embed, embedMany, EmbeddingModel, FlexibleSchema, generateImage, generateSpeech, generateText, ImageModel, InferSchema,
  JSONSchema7, LanguageModel, Output, OutputInterface, rerank, RerankingModel, SpeechModel, streamText, ToolLoopAgent, ToolLoopAgentSettings, ToolSet,
  transcribe, TranscriptionModel,
} from 'ai';
import type { EmbeddingModelId, ImageModelId, ModelId, ModelIdOf, ModelKind, RerankingModelId, SpeechModelId, TranscriptionModelId } from './models.ts';

/** The runtime context type `ai` calls take (`runtimeContext`) */
type RuntimeContext = Parameters<typeof generateText>[0] extends { runtimeContext?: infer C } ? C : never;

interface OutputNaming {
  /** Guides the provider (a tool or schema name) */
  name?: string;
  description?: string;
}

/**
 * A spec's schema: one `ai` takes (a zod or other standard schema, or `jsonSchema()`), or a plain JSON Schema,
 * which stored settings can hold. The reply to a plain JSON Schema is `unknown`: it isn't validated.
 */
export type OutputSchema = FlexibleSchema<unknown> | JSONSchema7;

/** The value a spec's schema describes */
type OutputSchemaValue<S> = S extends FlexibleSchema<unknown> ? InferSchema<S> : unknown;

/**
 * Structured output as data: what `Output.text`, `.json`, `.object`, `.array` and `.choice` from `ai`
 * take, with the kind named by `type`. Code that can't import `ai` (actions) and stored settings use it;
 * an `Output` from `ai` works in its place.
 */
export type OutputSpec =
  | { type: 'text' }
  | ({ type: 'json' } & OutputNaming)
  | ({ type: 'object'; schema: OutputSchema } & OutputNaming)
  | ({ type: 'array'; element: OutputSchema; minItems?: number; maxItems?: number } & OutputNaming)
  | ({ type: 'choice'; options: readonly string[] } & OutputNaming);

/** The AI SDK `Output` an `output` option stands for: itself, or the one its spec builds */
export type OutputOf<O> =
  O extends OutputInterface ? O :
  O extends { type: 'object'; schema: infer S } ? OutputInterface<OutputSchemaValue<S>, DeepPartial<OutputSchemaValue<S>>, never> :
  O extends { type: 'array'; element: infer S } ? OutputInterface<OutputSchemaValue<S>[], OutputSchemaValue<S>[], OutputSchemaValue<S>> :
  O extends { type: 'choice'; options: readonly (infer C extends string)[] } ? OutputInterface<C, C, never> :
  O extends { type: 'json' } ? ReturnType<typeof Output.json> :
  ReturnType<typeof Output.text>;

/** An AI SDK call's options, with `model` named by id (and without the AI SDK's `_internal` test hooks) */
type WithModelId<Options, Id> = Omit<Options, 'model' | '_internal'> & { model: Id };

/** A value with its `model` named by id */
type ModelNamedById<T> = { [K in keyof T]: K extends 'model' ? ModelId : T[K] };

/** A callback (`prepareStep`, `prepareCall`) returning its model by id; `prepareCall` gets the call's model by id too */
type CallbackById<F, NamedInput extends boolean> = F extends (options: infer A) => infer R
  ? (options: NamedInput extends true ? ModelNamedById<A> : A) => ModelNamedById<Awaited<R>> | PromiseLike<ModelNamedById<Awaited<R>>> | Extract<Awaited<R>, undefined>
  : never;

/**
 * An AI SDK call's options, with models named by id (`model`, and the model `prepareStep` or `prepareCall` picks)
 * and `output` as an `Output` or its spec
 */
type InferenceOptions<Options, O> = {
  [K in keyof Options as K extends 'model' | 'output' | '_internal' ? never : K]:
    K extends 'prepareStep' ? CallbackById<NonNullable<Options[K]>, false> :
    K extends 'prepareCall' ? CallbackById<NonNullable<Options[K]>, true> :
    Options[K];
} & { model: ModelId; output?: O };

/** @internal The AI SDK model of each kind */
export interface _InferenceModels {
  language: LanguageModel;
  embedding: EmbeddingModel;
  image: ImageModel;
  speech: SpeechModel;
  transcription: TranscriptionModel;
  reranking: RerankingModel;
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
  /**
   * The AI SDK's `ToolLoopAgent`: `generate` and `stream` run `instructions`, `tools` and `output` in a loop until `stopWhen`
   * (20 steps by default). The model, and the user's key for it, resolve on each call.
   */
  createAgent<CALL_OPTIONS = never, TOOLS extends ToolSet = {}, CONTEXT extends RuntimeContext = RuntimeContext, const O extends OutputInterface | OutputSpec = never>(
    settings: InferenceOptions<ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, CONTEXT, OutputOf<O>>, O>,
  ): Promise<ToolLoopAgent<CALL_OPTIONS, TOOLS, CONTEXT, OutputOf<O>>>;
  /** The AI SDK's `embed`: one value's `embedding` */
  embed<CONTEXT extends RuntimeContext = RuntimeContext>(options: WithModelId<Parameters<typeof embed<CONTEXT>>[0], EmbeddingModelId>): ReturnType<typeof embed<CONTEXT>>;
  /** The AI SDK's `embedMany`: `embeddings` for `values`, in order */
  embedMany<CONTEXT extends RuntimeContext = RuntimeContext>(options: WithModelId<Parameters<typeof embedMany<CONTEXT>>[0], EmbeddingModelId>): ReturnType<typeof embedMany<CONTEXT>>;
  /** The AI SDK's `generateImage`: `image` (and `images`) for a `prompt` */
  generateImage(options: WithModelId<Parameters<typeof generateImage>[0], ImageModelId>): ReturnType<typeof generateImage>;
  /** The AI SDK's `generateSpeech`: `audio` for `text` */
  generateSpeech(options: WithModelId<Parameters<typeof generateSpeech>[0], SpeechModelId>): ReturnType<typeof generateSpeech>;
  /** The AI SDK's `transcribe`: `text` and `segments` for `audio` */
  transcribe(options: WithModelId<Parameters<typeof transcribe>[0], TranscriptionModelId>): ReturnType<typeof transcribe>;
  /** The AI SDK's `rerank`: `documents` ordered by relevance to `query` */
  rerank<VALUE extends Parameters<typeof rerank>[0]['documents'][number], CONTEXT extends RuntimeContext = RuntimeContext>(
    options: WithModelId<Parameters<typeof rerank<VALUE, CONTEXT>>[0], RerankingModelId>,
  ): ReturnType<typeof rerank<VALUE, CONTEXT>>;
}

/** The `Output` an `output` option stands for: an `Output` passes through, a spec builds its `Output.*` */
async function toAiOutput(output: OutputInterface | OutputSpec | undefined): Promise<OutputInterface | undefined> {
  // Every Output implements parseCompleteOutput; a spec is plain data
  if (output === undefined || 'parseCompleteOutput' in output) return output;
  const { Output, jsonSchema } = await import('ai');
  // What `ai` takes as a schema (its `asSchema`): none (null or undefined: an empty object schema), a `jsonSchema()`
  // Schema (marked with its symbol), a lazy schema (a function) or a standard schema. Anything else is a plain JSON
  // Schema, a boolean one included, which `ai` would take for a lazy schema.
  const toSchema = (schema: OutputSchema): FlexibleSchema<unknown> =>
    schema == null || typeof schema === 'function' || (typeof schema === 'object' && (Symbol.for('vercel.ai.schema') in schema || '~standard' in schema))
      ? schema as FlexibleSchema<unknown>
      : jsonSchema(schema as JSONSchema7);
  switch (output.type) {
    case 'text': return Output.text();
    case 'json': return Output.json(output);
    case 'object': return Output.object({ ...output, schema: toSchema(output.schema) });
    case 'array': return Output.array({ ...output, element: toSchema(output.element) });
    case 'choice': return Output.choice({ ...output, options: [...output.options] });
  }
}

/** @internal A model of a kind, for an id naming a provider that gives it */
export type _ResolveModel = <K extends ModelKind>(kind: K, id: ModelIdOf<K>) => _InferenceModels[K] | Promise<_InferenceModels[K]>;

/**
 * @internal An {@link InferenceService} that runs the AI SDK on the models `resolveModel` gives for ids:
 * the host's implementation and `fakeInference`. `ai` loads on the first call.
 */
export function _createInferenceService(resolveModel: _ResolveModel): InferenceService {
  /** A language model named by id; one the AI SDK already resolved passes through */
  const languageModel = async (model: unknown) => typeof model === 'string' ? resolveModel('language', model as ModelId) : model;
  type PrepareStep = ((options: never) => unknown) | undefined;
  /** `prepareStep` with the model it picks by id resolved */
  const resolvingStepModel = (prepareStep: PrepareStep) => prepareStep && (async (options: never) => {
    const result = await prepareStep(options) as { model?: unknown } | undefined;
    return result?.model === undefined ? result : { ...result, model: await languageModel(result.model) };
  });

  return {
    async generateText({ model, output, prepareStep, ...options }) {
      const { generateText } = await import('ai');
      return generateText({
        ...options, output: await toAiOutput(output), model: await resolveModel('language', model), prepareStep: resolvingStepModel(prepareStep),
      } as Parameters<typeof generateText>[0]) as never;
    },
    async streamText({ model, output, prepareStep, ...options }) {
      const { streamText } = await import('ai');
      return streamText({
        ...options, output: await toAiOutput(output), model: await resolveModel('language', model), prepareStep: resolvingStepModel(prepareStep),
      } as Parameters<typeof streamText>[0]) as never;
    },
    async createAgent({ output, prepareCall, ...settings }) {
      const { ToolLoopAgent } = await import('ai');
      return new ToolLoopAgent({
        // `model` stays an id until a call: each generate or stream resolves it, reading the user's current key
        ...settings,
        output: await toAiOutput(output),
        prepareCall: async (options: { model: unknown; prepareStep?: PrepareStep }) => {
          const prepared = (prepareCall ? await prepareCall(options as never) : options) as typeof options;
          return { ...prepared, model: await languageModel(prepared.model), prepareStep: resolvingStepModel(prepared.prepareStep) };
        },
      } as unknown as ConstructorParameters<typeof ToolLoopAgent>[0]) as never;
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
    async rerank({ model, ...options }) {
      const { rerank } = await import('ai');
      return rerank({ ...options, model: await resolveModel('reranking', model) }) as never;
    },
  };
}
