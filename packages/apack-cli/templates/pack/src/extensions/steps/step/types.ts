import type { NodeBase } from '@apack/sdk';
import type { DSLNodeBase } from '@apack/sdk/build';

export interface DSL__PASCAL__Node extends DSLNodeBase {
  type: '__TYPE__';
  label?: string;
}

export interface __PASCAL__Node extends NodeBase {
  nodeType: '__TYPE__';
}
