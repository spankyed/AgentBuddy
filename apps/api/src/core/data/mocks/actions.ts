import { EARS } from '@/core/types';
import type { Rows } from '@/core/data';
import type { ActionEntity } from '@/systems/actions/types';
import { tidyFunction } from '@/core/utils/tidy-function';

const nowMs = Date.now();

const actionStreamToFE = tidyFunction(`
  const { message } = params;

  services.logger.info(message)
`);
const actionSaveEntity = tidyFunction(`
  const { entityType, data } = params;

  const result = await services.database.insert(entityType, data);
  await services.logger.info('Entity saved', { entityType, id: result.id });

  return result;
`);

export const actionRows: Rows = {
  entity: [
    /*───────────────────────────────────────────────────────────────*
     * Action entities                                               *
     *───────────────────────────────────────────────────────────────*/
    {
      id: 'Action-stream-to-fe',
      entityType: EARS.Entity.Action,
      createdAt: nowMs - 70,
      label: 'Stream to FE',
      description: 'Streams a message to the front-end',
      category: 'utility',
      input: {
        message: {
          name: 'message',
          type: 'string' as const,
          required: true,
          description: 'User message'
        },
      },
      actionFn: actionStreamToFE,
      output: { logged: 'boolean', message: 'string' },
      updatedAt: nowMs - 70
    } as ActionEntity,

    {
      id: 'Action-save-entity',
      entityType: EARS.Entity.Action,
      createdAt: nowMs - 100,
      label: 'Save Entity',
      description: 'Saves an entity to the database',
      category: 'database',
      input: {
        entityType: {
          name: 'entityType',
          type: 'string' as const,
          required: true,
          description: 'The type of entity to save',
          placeholder: 'e.g., User, Post, Comment'
        },
        data: {
          name: 'data',
          type: 'object' as const,
          required: true,
          description: 'The entity data to save'
        }
      },
      actionFn: actionSaveEntity,
      output: { id: 'string', success: 'boolean' },
      updatedAt: nowMs - 100
    } as ActionEntity,
  ],

  /*───────────────────────────────────────────────────────────────*
   * Role assignments                                              *
   *───────────────────────────────────────────────────────────────*/
  role: [],

  /*───────────────────────────────────────────────────────────────*
   * Relationships                                                 *
   *───────────────────────────────────────────────────────────────*/
  relation: [],
};
