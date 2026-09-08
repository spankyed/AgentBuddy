import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { NodeBase } from '@abuddy/sdk/build';
import type { EARS } from '@abuddy/sdk';

export interface DSLCreateNode extends DSLNodeBase {
  type: 'create';
  entity: string;
}

export interface CreateNode extends NodeBase {
  nodeType: 'create';
  entityTypeTarget: EARS.Entity;
  entityId?: string;
  inferLabel?: boolean;
}
