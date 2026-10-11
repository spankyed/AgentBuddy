import type { DSLStepNode } from '@apack/sdk/build';
import type { DSLActionCodeOpts, DSLActionOpts } from './types.ts';

/** An action step that runs a named Action */
export function action(action: string, opts?: DSLActionOpts): DSLStepNode {
  return { type: 'action', action, ...opts };
}

/**
 * An action step that runs its own code, with no Action to name.
 *
 * The editor's code mode writes exactly this, and before it existed here an exported flow lost the code: the
 * DSL had no field for it, so `decompile` dropped it and named the node's label as an action instead.
 */
export function actionCode(actionFn: string, opts?: DSLActionCodeOpts): DSLStepNode {
  return { type: 'action', mode: 'code', actionFn, ...opts };
}
