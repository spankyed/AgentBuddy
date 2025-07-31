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
  
  startupData: (page = 1) => {
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
  create: (input: {
    label: string;
    description?: string;
    category?: string;
    parameters?: Record<string, any>;
    actionFn: string;
    output?: any;
  }): RepositoryResult<ActionEntity> => {
    try {
      if (!input.label?.trim()) {
        throw new RepositoryError('Label is required', RepositoryErrorCode.VALIDATION_ERROR);
      }
      if (!input.actionFn?.trim()) {
        throw new RepositoryError('Action function is required', RepositoryErrorCode.VALIDATION_ERROR);
      }
      
      const action = createEntityWithDefaults<ActionEntity>(
        EARS.Entity.Action,
        {
          ...input,
          input: input.parameters || {}, // Map parameters -> input
          parameters: undefined,
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
    parameters?: Record<string, any>;
    actionFn?: string;
    output?: any;
  }): OperationResult => {
    try {
      if (!actionQueries.byId(id)) {
        throw new RepositoryError(`Action ${id} not found`, RepositoryErrorCode.NOT_FOUND);
      }
      
      const { parameters, ...rest } = updates;
      
      // If parameters are provided, we need to replace the entire input object
      if (parameters !== undefined) {
        // First, drop the existing input to ensure complete replacement
        const transaction = tx(id);
        transaction.drop(EARS.AttrKind.Custom('input'));
        transaction.put('input', parameters);
        transaction.merge('updatedAt', Date.now());
        
        // Update other fields normally
        if (Object.keys(rest).length > 0) {
          updateEntity(id, rest);
        }
      } else {
        // No parameters update, just update other fields
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