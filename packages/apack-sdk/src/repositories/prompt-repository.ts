// Prompts (Prompt rows), which llm steps run: the SDK declares Prompt, and its flow compiler and
// appliers resolve prompts by label
import { RepositoryError, RepositoryErrorCode } from '@apackdev/ears';
import { boundEars as ears } from '../ears/index.ts';
import { EARS } from '../types/entities.ts';
import type { PromptEntity, TemplateInput } from '../types/sdk-entities.ts';

/** A prompt's fields, as it's created */
export interface PromptInput {
  label: string;
  description?: string;
  templateFn: string;
  inputs?: Record<string, TemplateInput>;
  /** A JSON schema for structured output */
  outputSchema?: unknown;
  category?: string;
  contentHash?: string;
}

/** Reads and writes of prompts; trashed prompts stay stored, and reads leave them out */
export const promptRepository = {
  /** A prompt that isn't in the trash */
  byId: (id: EARS.EntityId): PromptEntity | undefined => ears().findById<PromptEntity>(id) ?? undefined,

  /** Every prompt that isn't in the trash */
  all: (): PromptEntity[] => ears().findAll<PromptEntity>(EARS.Entity.Prompt),

  byLabel: (label: string): PromptEntity | undefined => ears().findWhere<PromptEntity>(EARS.Entity.Prompt, 'label', label)[0],

  /** Creates a prompt; its label and template are required */
  create: (data: PromptInput): PromptEntity => {
    if (!data.label?.trim()) throw new RepositoryError('Label is required', RepositoryErrorCode.VALIDATION_ERROR);
    if (!data.templateFn?.trim()) throw new RepositoryError('Template is required', RepositoryErrorCode.VALIDATION_ERROR);
    return ears().createEntityWithDefaults(EARS.Entity.Prompt, { ...data, inputs: data.inputs || {} }, 'PROMPT') as unknown as PromptEntity;
  },

  update: (id: EARS.EntityId, updates: Partial<PromptInput>): void => {
    if (!promptRepository.byId(id)) throw new RepositoryError(`Prompt ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    ears().write(id).setMany({ ...updates });
  },

  /** Moves a prompt to the trash; it stays stored */
  delete: (id: EARS.EntityId): void => {
    if (!ears().query.withTrashed.ids(id).exists()) throw new RepositoryError(`Prompt ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    ears().write(id).trash();
  },
};
