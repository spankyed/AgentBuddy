import type { EARS } from '@/__generated__/ears';
import type { Category } from '@/__generated__/types';
import type { ActionParameter } from '@abuddy/sdk/build';

export interface ActionEntity {
  id: EARS.EntityId;
  entityType: EARS.Entity.Action;
  label: string;
  description?: string;
  category?: string;
  input: Record<string, ActionParameter>;
  actionFn: string;
  output?: any;
  /** SHA256 hash of DSL source at last seed. Absent on user-created actions. */
  sourceHash?: string;
  createdAt: number;
  updatedAt: number;
  /** Soft-delete marker, written by the repository rather than removing the row. */
  deleted?: boolean;
  /** Epoch ms at which the soft delete happened. */
  deletedAt?: number;
}

export interface ActionsStartupData {
  actions: ActionEntity[];
  page: number;
  totalPages: number;
  totalCount: number;
  categories?: Category[];
}

export type OutgoingActionEvents =
  | { type: 'ACTIONS_LISTED'; data: ActionsStartupData }
  | { type: 'ACTION_SELECTED'; actionId: EARS.EntityId; data: ActionEntity }
  | { type: 'ACTION_CREATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_UPDATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_DELETED'; actionId: EARS.EntityId }
  | { type: 'ACTIONS_PAGE_LOADED'; data: { actions: ActionEntity[]; page: number; totalPages: number } }
  | { type: 'ACTIONS_IMPORTED'; count: number; errors?: string[] }
  | { type: 'ACTIONS_IMPORT_FAILED'; errors: string[] }
  | { type: 'ACTIONS_EXPORTED'; filePath: string; actionCount: number }
  | { type: 'ACTIONS_EXPORT_FAILED'; errors: string[] }
