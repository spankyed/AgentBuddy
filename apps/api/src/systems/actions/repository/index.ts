import { EARS } from '@/shared/ears/types';
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
} from '@/shared/repository';
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
      updateEntity(id, {
        ...rest,
        ...(parameters && { input: parameters }),
      });
      
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

// Compatibility exports for old API
export const getActionById = (id: EARS.EntityId) => actionQueries.byId(id);
export const getAllActions = () => actionQueries.all();