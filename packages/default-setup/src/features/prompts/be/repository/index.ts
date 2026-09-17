import type { EARS } from '@/__generated__/ears';
import { promptRepository, type PromptInput } from '@abuddy/sdk/repositories';
import type { PromptEntity } from '@abuddy/sdk';

/**
 * Prompts Repository: the prompts plugin's views over the SDK's prompt repository (`promptRepository`),
 * which owns their reads and writes
 */

// Queries
export const promptQueries = {
  byId: (id: EARS.EntityId): PromptEntity | undefined => promptRepository.byId(id),

  all: (): PromptEntity[] => promptRepository.all(),

  byLabel: (label: string): PromptEntity | undefined => promptRepository.byLabel(label),

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
  }): PromptEntity => promptRepository.create(input as PromptInput),

  update: (id: EARS.EntityId, updates: {
    label?: string;
    description?: string;
    templateFn?: string;
    inputs?: Record<string, any>;
    category?: string;
    sourceHash?: string;
  }): void => promptRepository.update(id, updates as Partial<PromptInput>),

  /** Marks the prompt deleted */
  delete: (id: EARS.EntityId): void => promptRepository.delete(id),
};
