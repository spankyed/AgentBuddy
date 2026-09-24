import { promptRepository } from '@abuddy/sdk/repositories';

/**
 * Prompts Repository: the SDK's prompt repository (`promptRepository`), which owns their reads and writes, as the
 * prompts plugin uses it, and the plugin's views. The SDK's methods are taken as they are, not wrapped.
 */

// Queries
export const promptQueries = {
  byId: promptRepository.byId,
  all: promptRepository.all,
  byLabel: promptRepository.byLabel,

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
  create: promptRepository.create,
  update: promptRepository.update,
  /** Marks the prompt deleted */
  delete: promptRepository.delete,
};
