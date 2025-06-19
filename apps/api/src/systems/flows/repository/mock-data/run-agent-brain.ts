import { EARS } from '@/shared/ears/types';
import type { Rows } from '@/shared/types';

const nowMs = Date.now();

export const runAgentBrainFlow: Rows = {
  /*──────────────────────────────────────────*
   * Core entities                            *
   *──────────────────────────────────────────*/
  entity: [
    /* Graph container */
    {
      id: "Flow-a",
      shortCode: "F-a",
      entityType: EARS.Entity.Flow,
      createdAt: nowMs - 1_000,
      label: "Run Agent Brain",
      flowType: "workflow",
    },
  ],

  /*──────────────────────────────────────────*
   * Role assignments                         *
   *──────────────────────────────────────────*/
  role: [
    {
      entityId: "Flow-a",
      role: EARS.RoleKind.Custom("root_flow"),
    },
  ],

  /*──────────────────────────────────────────*
   * Relationships                            *
   *──────────────────────────────────────────*/
  relation: [],
}; 