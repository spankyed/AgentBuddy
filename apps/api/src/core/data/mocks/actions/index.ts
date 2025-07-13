import type { Rows } from '@/core/data';
import { streamToFEAction } from './stream-to-fe';
import { saveEntityAction } from './save-entity';

export const actionRows: Rows = {
  entity: [
    /*───────────────────────────────────────────────────────────────*
     * Action entities                                               *
     *───────────────────────────────────────────────────────────────*/
    streamToFEAction,
    saveEntityAction,
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
