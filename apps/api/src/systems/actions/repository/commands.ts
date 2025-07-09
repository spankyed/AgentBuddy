import { EARS } from '@/shared/ears/types';
import { 
  createEntityWithDefaults, 
  updateEntity,
  RepositoryResult,
  OperationResult,
  successResult,
  operationSuccess,
  errorResult,
  RepositoryError,
  RepositoryErrorCode
} from '@/shared/repository';
import type { ActionEntity } from '../types';
import { actionQueries } from './queries';

/**
 * Type-safe command operations for Actions
 */

// Input types for commands
export interface CreateActionInput {
  label: string;
  description?: string;
  category?: string;
  input?: Record<string, any>;
  actionFn: string;
  output?: any;
}

export interface UpdateActionInput {
  label?: string;
  description?: string;
  category?: string;
  input?: Record<string, any>;
  actionFn?: string;
  output?: any;
}

export const actionCommands = {
  // Create a new action
  create: (input: CreateActionInput): RepositoryResult<ActionEntity> => {
    try {
      // Validate required fields
      if (!input.label?.trim()) {
        throw new RepositoryError(
          'Action label is required',
          RepositoryErrorCode.VALIDATION_ERROR
        );
      }
      
      if (!input.actionFn?.trim()) {
        throw new RepositoryError(
          'Action function is required',
          RepositoryErrorCode.VALIDATION_ERROR
        );
      }
      
      // Create action with defaults
      const action = createEntityWithDefaults<ActionEntity>(
        EARS.Entity.Action,
        {
          ...input,
          input: input.input || {},
        },
        'ACT'
      );
      
      return successResult(action);
    } catch (error) {
      return errorResult(error, 'Failed to create action');
    }
  },

  // Update an existing action
  update: (
    actionId: EARS.EntityId, 
    updates: UpdateActionInput
  ): OperationResult => {
    try {
      // Check if action exists
      if (!actionQueries.exists(actionId)) {
        throw new RepositoryError(
          `Action ${actionId} not found`,
          RepositoryErrorCode.NOT_FOUND
        );
      }
      
      // Filter out undefined values
      const filteredUpdates = Object.entries(updates)
        .filter(([_, value]) => value !== undefined)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      
      // Update the action
      updateEntity(actionId, filteredUpdates);
      
      return operationSuccess();
    } catch (error) {
      return errorResult(error, 'Failed to update action');
    }
  },

  // Update action label
  updateLabel: (
    actionId: EARS.EntityId, 
    label: string
  ): OperationResult => {
    return actionCommands.update(actionId, { label });
  },

  // Update action category
  updateCategory: (
    actionId: EARS.EntityId, 
    category: string
  ): OperationResult => {
    return actionCommands.update(actionId, { category });
  },

  // Delete an action (soft delete by adding a deleted flag)
  delete: (actionId: EARS.EntityId): OperationResult => {
    try {
      // Check if action exists
      if (!actionQueries.exists(actionId)) {
        throw new RepositoryError(
          `Action ${actionId} not found`,
          RepositoryErrorCode.NOT_FOUND
        );
      }
      
      // Mark as deleted (soft delete)
      updateEntity(actionId, { 
        deleted: true,
        deletedAt: Date.now() 
      });
      
      return operationSuccess();
    } catch (error) {
      return errorResult(error, 'Failed to delete action');
    }
  },

  // Validate action input parameters
  validateInput: (
    actionId: EARS.EntityId,
    input: Record<string, any>
  ): RepositoryResult<{ valid: boolean; errors?: string[] }> => {
    try {
      const action = actionQueries.byId(actionId);
      if (!action) {
        throw new RepositoryError(
          `Action ${actionId} not found`,
          RepositoryErrorCode.NOT_FOUND
        );
      }
      
      const errors: string[] = [];
      
      // Check required parameters
      Object.entries(action.input || {}).forEach(([key, param]) => {
        if (param.required && !(key in input)) {
          errors.push(`Missing required parameter: ${key}`);
        }
        
        // Type validation could be added here
        if (key in input && param.type !== 'any') {
          const value = input[key];
          const valueType = Array.isArray(value) ? 'array' : typeof value;
          
          if (valueType !== param.type) {
            errors.push(`Parameter ${key} should be of type ${param.type}, got ${valueType}`);
          }
        }
      });
      
      return successResult({
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      return errorResult(error, 'Failed to validate action input');
    }
  },
} as const; 