import type { NodeBase } from '@abuddy/sdk';
import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { EARS } from '@abuddy/sdk';

export type UpdateOnMissing = 'fail' | 'ignore' | 'create';

export interface DSLUpdateNode extends DSLNodeBase {
  type: 'update';
  /** The entity's id: a `$.` path resolved when the step runs (`$.lastStep.result.id`), or a literal id */
  target: string;
  /** Fields to write: `{ field: source }`, resolved as mappings when the step runs */
  map?: Record<string, string>;
  /** Literal fields to write; mapped fields win */
  params?: Record<string, unknown>;
  /** When no entity has the target id: `fail` (default) errors, `ignore` completes, `create` creates one of `entity` */
  onMissing?: UpdateOnMissing;
  /** The entity type `onMissing: 'create'` creates */
  entity?: string;
}

export interface UpdateNode extends NodeBase {
  nodeType: 'update';
  target: string;
  params?: Record<string, unknown>;
  fieldMappings?: Array<{ target: string; source: string; default?: unknown }>;
  onMissing?: UpdateOnMissing;
  // The SDK's open EARS.Entity on purpose, as the create step's: any entity type a flow names
  entityTypeTarget?: EARS.Entity;
}
