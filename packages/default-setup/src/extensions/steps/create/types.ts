import type { NodeBase } from '@abuddy/sdk';
import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { EARS } from '@abuddy/sdk';

export interface DSLCreateNode extends DSLNodeBase {
  type: 'create';
  entity: string;
}

export interface CreateNode extends NodeBase {
  nodeType: 'create';
  // The SDK's open EARS.Entity on purpose: a flow's create step may name any entity type
  entityTypeTarget: EARS.Entity;
  entityId?: string;
  inferLabel?: boolean;
}
