import { registerRepository } from '@/repository';
import { EARS } from '@/core/types';
import {
  findById,
  findByIdRaw,
  findAll,
  findWhere,
  createEntityWithDefaults,
  updateEntity,
  RepositoryError,
  RepositoryErrorCode
} from '@/core/shared/repository';
import type { PromptEntity } from '../types';

/**
 * Prompts Repository
 */

// Queries
export const promptQueries = {
  byId: (id: EARS.EntityId) =>
    findById<PromptEntity>(id),

  all: () =>
    findAll<PromptEntity>(EARS.Entity.Prompt),

  byLabel: (label: string): PromptEntity | undefined => {
    return findWhere<PromptEntity>(
      EARS.Entity.Prompt,
      'label',
      label
    )[0];
  },

  connectedData: (page = 1, pageSize = 20) => {
    const all = promptQueries.all();
    const start = (page - 1) * pageSize;
    const items = all.slice(start, start + pageSize);

    return {
      prompts: items,
      page,
      totalPages: Math.ceil(all.length / pageSize),
      totalCount: all.length,
    };
  },
};



// Commands
export const promptCommands = {
  create: (input: {
    label: string;
    description?: string;
    templateFn: string;
    inputs?: Record<string, any>;
    category?: string;
    sourceHash?: string;
  }): PromptEntity => {
    if (!input.label?.trim()) {
      throw new RepositoryError('Label is required', RepositoryErrorCode.VALIDATION_ERROR);
    }
    if (!input.templateFn?.trim()) {
      throw new RepositoryError('Template is required', RepositoryErrorCode.VALIDATION_ERROR);
    }

    const prompt = createEntityWithDefaults<PromptEntity>(
      EARS.Entity.Prompt,
      input as any,
      'PROMPT'
    );

    return prompt;
  },

  update: (id: EARS.EntityId, updates: {
    label?: string;
    description?: string;
    templateFn?: string;
    inputs?: Record<string, any>;
    category?: string;
    sourceHash?: string;
  }): void => {
    if (!promptQueries.byId(id)) {
      throw new RepositoryError(`Prompt ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    updateEntity(id, updates);
  },
  
  delete: (id: EARS.EntityId): void => {
    // Use findByIdRaw to check existence (including already deleted entities)
    const existing = findByIdRaw<PromptEntity>(id);
    if (!existing) {
      throw new RepositoryError(`Prompt ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    updateEntity(id, { deleted: true, deletedAt: Date.now() });
  },
};

registerRepository('promptQueries', promptQueries);
registerRepository('promptCommands', promptCommands);