import { EARS } from '@/core/types';
import type { ActionEntity } from '@/systems/actions/types';
import { tidyFunction } from '@/core/utils/tidy-function';

const nowMs = Date.now();

const actionFn = tidyFunction(`
  const { entityType, data } = params;

  const result = await services.database.insert(entityType, data);
  await services.logger.info('Entity saved', { entityType, id: result.id });

  return result;
`);

export const saveEntityAction: ActionEntity = {
  id: 'Action-save-entity',
  entityType: EARS.Entity.Action,
  createdAt: nowMs - 100,
  label: 'Save Entity',
  description: 'Saves an entity to the database',
  category: 'database',
  input: {
    entityType: {
      type: 'string' as const,
      required: true,
      description: 'The type of entity to save',
      placeholder: 'e.g., User, Post, Comment'
    },
    data: {
      type: 'object' as const,
      required: true,
      description: 'The entity data to save'
    }
  },
  actionFn,
  output: { id: 'string', success: 'boolean' },
  updatedAt: nowMs - 100
};