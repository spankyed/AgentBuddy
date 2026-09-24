import { EARS } from '@/__generated__/ears';

import type { ActionEntity } from '@abuddy/sdk';

export interface ActionsStartupData {
  actions: ActionEntity[];
  page: number;
  totalPages: number;
  totalCount: number;
  categories?: Category[];
}

// ── This feature's settings ───────────────────────────────────────────────
// Its own shape, which the app stores without knowing: the app owns the document, each feature its slice.
export interface Category {
  name: string;
  color: string; // Hex color value
}

export interface ActionsSettings {
  categories: Category[];
}

export type IncomingActionEvents =
  | { type: 'ACTION_SELECT'; actionId: string }
  | { type: 'CREATE_ACTION'; label: string; input: Record<string, any>; actionFn: string; output?: any; description?: string; category?: string }
  | { type: 'UPDATE_ACTION'; actionId: string; label?: string; input?: Record<string, any>; actionFn?: string; output?: any; description?: string; category?: string }
  | { type: 'DELETE_ACTION'; actionId: string }
  | { type: 'FETCH_ACTIONS_PAGE'; page?: number }
  | { type: 'FETCH_ALL_ACTIONS' }
  | { type: 'IMPORT_ACTIONS'; actions: any }
  | { type: 'EXPORT_ACTIONS'; directory: string }

export type OutgoingActionEvents =
  | { type: 'ACTIONS_LISTED'; data: ActionsStartupData }
  | { type: 'ACTION_SELECTED'; actionId: EARS.EntityId; data: ActionEntity }
  | { type: 'ACTION_CREATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_UPDATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_DELETED'; actionId: EARS.EntityId }
  | { type: 'ACTIONS_PAGE_LOADED'; data: { actions: ActionEntity[]; page: number; totalPages: number } }
  | { type: 'ACTIONS_ALL_LOADED'; data: { actions: ActionEntity[] } }
  | { type: 'ACTIONS_IMPORTED'; count: number; errors?: string[] }
  | { type: 'ACTIONS_IMPORT_FAILED'; errors: string[] }
  | { type: 'ACTIONS_EXPORTED'; filePath: string; actionCount: number }
  | { type: 'ACTIONS_EXPORT_FAILED'; errors: string[] }
