import { EARS } from '@/core/types';
import { 
  findById, 
  findAll,
  createEntityWithDefaults,
  updateEntity,
  successResult,
  operationSuccess,
  errorResult,
  RepositoryError,
  RepositoryErrorCode,
  type RepositoryResult,
  type OperationResult,
  findWhere
} from '@/core/utils/repository';
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
    
  startupData: (page = 1, pageSize = 20) => {
    const all = findAll<PromptEntity>(EARS.Entity.Prompt);
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
  }): RepositoryResult<PromptEntity> => {
    try {
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
      
      return successResult(prompt);
    } catch (error) {
      return errorResult(error);
    }
  },
  
  update: (id: EARS.EntityId, updates: {
    label?: string;
    description?: string;
    templateFn?: string;
    inputs?: Record<string, any>;
  }): OperationResult => {
    try {
      if (!promptQueries.byId(id)) {
        throw new RepositoryError(`Prompt ${id} not found`, RepositoryErrorCode.NOT_FOUND);
      }
      
      updateEntity(id, updates);
      return operationSuccess();
    } catch (error) {
      return errorResult(error);
    }
  },
  
  delete: (id: EARS.EntityId): OperationResult => {
    try {
      if (!promptQueries.byId(id)) {
        throw new RepositoryError(`Prompt ${id} not found`, RepositoryErrorCode.NOT_FOUND);
      }
      
      updateEntity(id, { deleted: true, deletedAt: Date.now() });
      return operationSuccess();
    } catch (error) {
      return errorResult(error);
    }
  },
};