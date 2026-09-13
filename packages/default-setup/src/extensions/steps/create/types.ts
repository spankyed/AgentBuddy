import type { DSLNodeBase, NodeBase } from '@abuddy/sdk/build';
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
