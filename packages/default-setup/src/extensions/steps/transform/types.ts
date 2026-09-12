import type { DSLNodeBase, NodeBase } from '@abuddy/sdk/build';

declare module '@abuddy/sdk/types' {
  interface NodeEntityRegistry { transform: TransformNode }
}

export interface DSLTransformNode extends DSLNodeBase {
  type: 'transform';
  script: string;
  outputType?: 'json' | 'text' | 'custom';
}

export interface TransformNode extends NodeBase {
  nodeType: 'transform';
  script: string;
  outputType?: 'json' | 'text' | 'custom';
}
