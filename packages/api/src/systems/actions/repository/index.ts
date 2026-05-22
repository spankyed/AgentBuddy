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
import type { ActionEntity } from '../types';

/**
 * Action Repository - Dead simple CRUD operations
 */

// Queries
export const actionQueries = {
  byId: (id: EARS.EntityId) =>
    findById<ActionEntity>(id),

  all: () =>
    findAll<ActionEntity>(EARS.Entity.Action),

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
  }): ActionEntity => {
    if (!data.label?.trim()) {
      throw new RepositoryError('Label is required', RepositoryErrorCode.VALIDATION_ERROR);
    }
    if (!data.actionFn?.trim()) {
      throw new RepositoryError('Action function is required', RepositoryErrorCode.VALIDATION_ERROR);
    }
    
    const action = createEntityWithDefaults<ActionEntity>(
      EARS.Entity.Action,
      {
        ...data,
        input: data.input || {},
      } as any,
      'ACT'
    );
    
    return action;
  },
  
  update: (id: EARS.EntityId, updates: {
    label?: string;
    description?: string;
    category?: string;
    input?: Record<string, any>;
    actionFn?: string;
    output?: any;
    sourceHash?: string;
  }): void => {
    if (!actionQueries.byId(id)) {
      throw new RepositoryError(`Action ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    updateEntity(id, updates);
  },
  
  delete: (id: EARS.EntityId): void => {
    // Use findByIdRaw to check existence (including already deleted entities)
    const existing = findByIdRaw<ActionEntity>(id);
    if (!existing) {
      throw new RepositoryError(`Action ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    updateEntity(id, { deleted: true, deletedAt: Date.now() });
  },
} as const;

registerRepository('actionQueries', actionQueries);
registerRepository('actionCommands', actionCommands);