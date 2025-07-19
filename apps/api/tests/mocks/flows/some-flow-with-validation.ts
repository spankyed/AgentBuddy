import { EARS } from '@/core/types';
import type { Rows } from '@/core/data';

const nowMs = Date.now();

export const someFlowWithValidation: Rows = {
  /*──────────────────────────────────────────*
   * Core entities                            *
   *──────────────────────────────────────────*/
  entity: [
    /* Graph container */
    {
      id: "Flow-c",
      shortCode: "F-c",
      entityType: EARS.Entity.Flow,
      createdAt: nowMs - 1_000,
      label: "Some flow with validation",
      flowType: "workflow",
    },
  ],

  /*──────────────────────────────────────────*
   * Role assignments                         *
   *──────────────────────────────────────────*/
  role: [],

  /*──────────────────────────────────────────*
   * Relationships                            *
   *──────────────────────────────────────────*/
  relation: [],
}; 