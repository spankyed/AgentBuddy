import type { NodeBase } from '@apack/sdk';
import type { DSLNodeBase } from '@apack/sdk/build';
import type { EARS } from '@apack/sdk';
import type { FieldMapping, MapEntry } from '@apack/sdk/steps';

export interface DSLCreateNode extends DSLNodeBase {
  type: 'create';
  entity: string;
  /** Fields of the new entity: `{ field: source }`, resolved as mappings when the step runs */
  map?: Record<string, MapEntry>;
  /** Literal fields of the new entity; mapped fields win */
  params?: Record<string, unknown>;
  /** Label the entity from its `title`, `name` or `topic` when no `label` field is given (default true) */
  inferLabel?: boolean;
}

export interface CreateNode extends NodeBase {
  nodeType: 'create';
  // The SDK's open EARS.Entity on purpose: a flow's create step may name any entity type
  entityTypeTarget: EARS.Entity;
  params?: Record<string, unknown>;
  fieldMappings?: FieldMapping[];
  inferLabel?: boolean;
}
