import { EARS } from '@/core/types';
import type { Rows } from '@/core/data';
import type { ActionEntity } from '@/systems/actions/types';

const nowMs = Date.now();

export const actionRows: Rows = {
  entity: [
    /*───────────────────────────────────────────────────────────────*
     * Action entities                                               *
     *───────────────────────────────────────────────────────────────*/
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
      actionFn: `// Save entity to database
const { entityType, data } = params;
const result = await services.database.insert(entityType, data);
await services.logger.info('Entity saved', { entityType, id: result.id });
return result;`,
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