import type { Rows } from '@/core/data';
import { streamToFEAction } from './stream-to-fe';
import { saveEntityAction } from './save-entity';
import { EARS } from '@/core/types';

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
  relation: [
    /* Node to Action relationships */
    { source: "Node-a5s", kind: EARS.RelKind.INSTANCE_OF, target: "Action-save-entity", info: {} },
    { source: "Node-loa8s", kind: EARS.RelKind.INSTANCE_OF, target: "Action-stream-to-fe" },
  ],
};
