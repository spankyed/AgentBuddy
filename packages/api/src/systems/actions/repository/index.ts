import { EARS } from '@/core/types';
import { 
  findById, 
  findAll, 
  findWhere,
  createEntityWithDefaults,
  updateEntity,
  successResult,
  operationSuccess,
  errorResult,
  RepositoryError,
  RepositoryErrorCode,
  type RepositoryResult,
  type OperationResult
} from '@/core/utils/repository';
import type { ActionEntity } from '../types';
import { tx } from '@/core/utils/ears/helpers/transaction';

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
  }): RepositoryResult<ActionEntity> => {
    try {
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
      
      return successResult(action);
    } catch (error) {
      return errorResult(error);
    }
  },
  
  update: (id: EARS.EntityId, updates: {
    label?: string;
    description?: string;
    category?: string;
    input?: Record<string, any>;
    actionFn?: string;
    output?: any;
  }): OperationResult => {
    try {
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
      
      return operationSuccess();
    } catch (error) {
      return errorResult(error);
    }
  },
  
  delete: (id: EARS.EntityId): OperationResult => {
    try {
      if (!actionQueries.byId(id)) {
        throw new RepositoryError(`Action ${id} not found`, RepositoryErrorCode.NOT_FOUND);
      }
      
      updateEntity(id, { deleted: true, deletedAt: Date.now() });
      return operationSuccess();
    } catch (error) {
      return errorResult(error);
    }
  },
} as const;