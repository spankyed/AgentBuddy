import { EARS } from '@/shared/ears/types';

export interface ActionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  required?: boolean;
  description?: string;
  default?: any;
  placeholder?: string;
}

export interface ActionEntity {
  id: EARS.EntityId;
  entityType: EARS.Entity.Action;
  label: string;
  description?: string;
  category?: string;
  input: Record<string, ActionParameter>;
  actionFn: string;
  output?: any;
  createdAt: number;
  updatedAt: number;
}

export interface ActionsStartupData {
  actions: ActionEntity[];
  page: number;
  totalPages: number;
  totalCount: number;
}

export type OutgoingActionEvents =
  | { type: 'ACTIONS_STARTUP'; data: ActionsStartupData }
  | { type: 'ACTION_SELECTED'; actionId: EARS.EntityId; data: ActionEntity }
  | { type: 'ACTION_CREATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_UPDATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_DELETED'; actionId: EARS.EntityId }
  | { type: 'ACTIONS_PAGE_LOADED'; data: { actions: ActionEntity[]; page: number; totalPages: number } }