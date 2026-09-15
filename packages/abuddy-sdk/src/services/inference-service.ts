import type { generateText, streamText, OutputInterface, ToolSet } from 'ai';
import { getHostModule } from '../runtime/host.ts';
import type { ModelId } from './models.ts';

/** The runtime context type `ai` calls take (`runtimeContext`) */
type RuntimeContext = Parameters<typeof generateText>[0] extends { runtimeContext?: infer C } ? C : never;

/** An AI SDK call's options, with the model named by id instead of a model object */
type WithModelId<Options> = Omit<Options, 'model'> & { model: ModelId };

/**
 * Model calls with the user's provider keys. The options and results are the AI SDK's (`ai`), with
 * `model` given as a `provider:model` id; import `tool`, `Output`, `isStepCount` and types from `ai`.
 * The host implements it.
 */
export interface InferenceService {
  /** The AI SDK's `generateText`: text, structured `output`, and tool loops (`tools`, `stopWhen`) */
  generateText<TOOLS extends ToolSet = {}, CONTEXT extends RuntimeContext = RuntimeContext, OUTPUT extends OutputInterface = OutputInterface<string, string>>(
    options: WithModelId<Parameters<typeof generateText<TOOLS, CONTEXT, OUTPUT>>[0]>,
  ): ReturnType<typeof generateText<TOOLS, CONTEXT, OUTPUT>>;
  /** The AI SDK's `streamText`: read `stream` (parts), `textStream`, or the final `text` */
  streamText<TOOLS extends ToolSet = {}, CONTEXT extends RuntimeContext = RuntimeContext, OUTPUT extends OutputInterface = OutputInterface<string, string, never>>(
    options: WithModelId<Parameters<typeof streamText<TOOLS, CONTEXT, OUTPUT>>[0]>,
  ): Promise<ReturnType<typeof streamText<TOOLS, CONTEXT, OUTPUT>>>;
}

const host = () => getHostModule<InferenceService>('inference');

/** The host's implementation, registered as host module "inference" */
export const inference: InferenceService = {
  generateText: (options) => host().generateText(options),
  streamText: (options) => host().streamText(options),
};
