import type { NodeBase } from '@apack/sdk';
import type { DSLNodeBase } from '@apack/sdk/build';
import type { FieldMapping, MapEntry } from '@apack/sdk/steps';

export interface DSLFireNode extends DSLNodeBase {
  type: 'fire';
  event: string;
  scope?: 'local' | 'global';
  payload?: unknown;
  /** The payload read from the flow when the step runs: `{ payload: source }`. Wins over `payload` */
  map?: Record<string, MapEntry>;
}

export interface FireNode extends NodeBase {
  nodeType: 'fire';
  eventType: string;
  payload?: unknown;
  scope?: 'local' | 'global';
  fieldMappings?: FieldMapping[];
}
