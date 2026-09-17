import { EARS, findWhere } from '@/__generated__/ears';
import { actionRepository, type ActionInput } from '@abuddy/sdk/repositories';
import type { ActionEntity } from '@abuddy/sdk';

/**
 * Action Repository: the actions plugin's views over the SDK's action repository (`actionRepository`),
 * which owns their reads and writes
 */

// Queries
export const actionQueries = {
  byId: (id: EARS.EntityId): ActionEntity | undefined => actionRepository.byId(id),

  all: (): ActionEntity[] => actionRepository.all(),

  byLabel: (label: string): ActionEntity | undefined => actionRepository.byLabel(label),

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
  create: (data: {
    label: string;
    description?: string;
    category?: string;
    input?: Record<string, any>;
    actionFn: string;
    output?: any;
    sourceHash?: string;
  }): ActionEntity => actionRepository.create(data as ActionInput),

  update: (id: EARS.EntityId, updates: {
    label?: string;
    description?: string;
    category?: string;
    input?: Record<string, any>;
    actionFn?: string;
    output?: any;
    sourceHash?: string;
  }): void => actionRepository.update(id, updates as Partial<ActionInput>),

  /** Marks the action deleted */
  delete: (id: EARS.EntityId): void => actionRepository.delete(id),
} as const;
