import type { NodeBase } from '@abuddy/sdk';
import type { DSLNodeBase } from '@abuddy/sdk/build';

/** How a transform step's script return value becomes the step's result */
export type TransformOutputType = 'json' | 'text' | 'custom';

export interface DSLTransformNode extends DSLNodeBase {
  type: 'transform';
  /**
   * An async function body run as an action runs (`services.action.executeAction`): it receives `params`
   * (`params.input` is the previous step's result, then the mapped fields), `services` and `z`, and returns the output
   */
  script: string;
  /** `json` (default): the returned value, which must be JSON-serializable; `text`: `String(value)`; `custom`: the value as returned */
  outputType?: TransformOutputType;
  /** Fields of `params`, `{ target: source }` (see Mappings); a mapped `input` replaces the previous step's result */
  map?: Record<string, string>;
}

export interface TransformNode extends NodeBase {
  nodeType: 'transform';
  script: string;
  outputType?: TransformOutputType;
  fieldMappings?: Array<{ target: string; source: string; default?: unknown }>;
}
