// Actions (Action rows), which action steps run: the SDK declares Action, and its flow compiler and
// appliers resolve actions by label
import { RepositoryError, RepositoryErrorCode } from '@apackdev/ears';
import { boundEars as ears } from '../ears/index.ts';
import { EARS } from '../types/entities.ts';
import type { ActionEntity, ActionParameter } from '../types/sdk-entities.ts';

/** An action's fields, as it's created */
export interface ActionInput {
  label: string;
  description?: string;
  category?: string;
  input?: Record<string, ActionParameter>;
  actionFn: string;
  output?: unknown;
  contentHash?: string;
}

/** Reads and writes of actions; trashed actions stay stored, and reads leave them out */
export const actionRepository = {
  /** An action that isn't in the trash */
  byId: (id: EARS.EntityId): ActionEntity | undefined => ears().findById<ActionEntity>(id) ?? undefined,

  /** Every action that isn't in the trash */
  all: (): ActionEntity[] => ears().findAll<ActionEntity>(EARS.Entity.Action),

  byLabel: (label: string): ActionEntity | undefined => ears().findWhere<ActionEntity>(EARS.Entity.Action, 'label', label)[0],

  /** Creates an action; its label and function are required */
  create: (data: ActionInput): ActionEntity => {
    if (!data.label?.trim()) throw new RepositoryError('Label is required', RepositoryErrorCode.VALIDATION_ERROR);
    if (!data.actionFn?.trim()) throw new RepositoryError('Action function is required', RepositoryErrorCode.VALIDATION_ERROR);
    return ears().createEntityWithDefaults(EARS.Entity.Action, { ...data, input: data.input || {} }, 'ACT') as unknown as ActionEntity;
  },

  update: (id: EARS.EntityId, updates: Partial<ActionInput>): void => {
    if (!actionRepository.byId(id)) throw new RepositoryError(`Action ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    ears().write(id).setMany({ ...updates });
  },

  /** Moves an action to the trash; it stays stored */
  delete: (id: EARS.EntityId): void => {
    if (!ears().query.withTrashed.ids(id).exists()) throw new RepositoryError(`Action ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    ears().write(id).trash();
  },
};
