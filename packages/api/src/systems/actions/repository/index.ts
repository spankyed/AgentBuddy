import { EARS } from '@/core/types';
import { 
  findById, 
  findAll, 
  findWhere,
  createEntityWithDefaults,
  updateEntity,
  RepositoryError,
  RepositoryErrorCode
} from '@/core/utils/repository';
import type { ActionEntity } from '../types';
import { tx } from '@/core/ears/helpers/transaction';

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
    const all = findAll<ActionEntity>(EARS.Entity.Action);
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
  }): void => {
    if (!actionQueries.byId(id)) {
      throw new RepositoryError(`Action ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }
    
    const { input, ...rest } = updates;
    
    // If input is provided, use updateBatch to replace the entire input object
    if (input !== undefined) {
      tx(id).updateBatch({
        input: input,
        updatedAt: Date.now()
      });
      
      // Update other fields normally
      if (Object.keys(rest).length > 0) {
        updateEntity(id, rest);
      }
    } else {
      // No input update, just update other fields
      updateEntity(id, rest);
    }
  },
  
  delete: (id: EARS.EntityId): void => {
    if (!actionQueries.byId(id)) {
      throw new RepositoryError(`Action ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }
    
    updateEntity(id, { deleted: true, deletedAt: Date.now() });
  },
} as const;