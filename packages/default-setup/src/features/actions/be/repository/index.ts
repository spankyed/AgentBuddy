import { EARS, findWhere } from '@/__generated__/ears';
import { actionRepository } from '@abuddy/sdk/repositories';
import type { ActionEntity } from '@abuddy/sdk';

/**
 * Action Repository: the SDK's action repository (`actionRepository`), which owns their reads and writes, as the
 * actions plugin uses it, and the plugin's views. The SDK's methods are taken as they are, not wrapped.
 */

// Queries
export const actionQueries = {
  byId: actionRepository.byId,
  all: actionRepository.all,
  byLabel: actionRepository.byLabel,

  byCategory: (category: string) =>
    findWhere<ActionEntity>(EARS.Entity.Action, 'category', category),

  // Simple pagination
  paginated: (page = 1, pageSize = 20) => {
    const all = actionQueries.all();
    const start = (page - 1) * pageSize;
    return {
      items: all.slice(start, start + pageSize),
      page,
      pageSize,
      totalCount: all.length,
      totalPages: Math.ceil(all.length / pageSize),
    };
  },

  connectedData: (page = 1) => {
    const result = actionQueries.paginated(page, 20);
    return {
      actions: result.items,
      page: result.page,
      totalPages: result.totalPages,
      totalCount: result.totalCount,
    };
  },
} as const;

// Commands
export const actionCommands = {
  create: actionRepository.create,
  update: actionRepository.update,
  /** Marks the action deleted */
  delete: actionRepository.delete,
} as const;
