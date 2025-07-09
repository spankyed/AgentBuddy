import { EARS } from '@/shared/ears/types';
import { findById, findAll, findWhere } from '@/shared/repository';
import type { ActionEntity } from '../types';

/**
 * Type-safe query operations for Actions
 */

export const actionQueries = {
  // Find action by ID
  byId: (actionId: EARS.EntityId): ActionEntity | undefined => {
    return findById<ActionEntity>(actionId);
  },

  // Get all actions
  all: (): ActionEntity[] => {
    return findAll<ActionEntity>(EARS.Entity.Action);
  },

  // Get actions by category
  byCategory: (category: string): ActionEntity[] => {
    return findWhere<ActionEntity>(EARS.Entity.Action, 'category', category);
  },

  // Count total actions
  count: (): number => {
    return findAll<ActionEntity>(EARS.Entity.Action).length;
  },

  // Get paginated actions
  paginated: (page: number = 1, pageSize: number = 10): {
    actions: ActionEntity[];
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  } => {
    const allActions = findAll<ActionEntity>(EARS.Entity.Action);
    const totalCount = allActions.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    return {
      actions: allActions.slice(startIndex, endIndex),
      page,
      pageSize,
      totalCount,
      totalPages,
    };
  },

  // Check if action exists
  exists: (actionId: EARS.EntityId): boolean => {
    return actionQueries.byId(actionId) !== undefined;
  },

  // Get unique categories
  getCategories: (): string[] => {
    const actions = findAll<ActionEntity>(EARS.Entity.Action);
    const categories = new Set<string>();
    
    actions.forEach(action => {
      if (action.category) {
        categories.add(action.category);
      }
    });
    
    return Array.from(categories).sort();
  },

  // Get startup data (for backward compatibility)
  startupData: (page: number = 1): {
    actions: ActionEntity[];
    page: number;
    totalPages: number;
    totalCount: number;
  } => {
    return actionQueries.paginated(page, 20);
  },
} as const; 