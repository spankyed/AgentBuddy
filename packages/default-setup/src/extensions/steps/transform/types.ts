import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { NodeBase } from '@/features/flows/be/config/types';

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
