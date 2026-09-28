import type { NodeBase } from '@abuddy/sdk';
import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { FieldMapping } from '@abuddy/sdk/steps';

export interface DSLFireNode extends DSLNodeBase {
  type: 'fire';
  event: string;
  scope?: 'local' | 'global';
  payload?: unknown;
  /** The payload read from the flow when the step runs: `{ payload: source }`. Wins over `payload` */
  map?: Record<string, string>;
}

export interface FireNode extends NodeBase {
  nodeType: 'fire';
  eventType: string;
  payload?: unknown;
  scope?: 'local' | 'global';
  fieldMappings?: FieldMapping[];
}
