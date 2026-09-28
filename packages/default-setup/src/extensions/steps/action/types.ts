import type { NodeBase } from '@abuddy/sdk';
import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { FieldMapping } from '@abuddy/sdk/steps';

/** What either shape of action step carries */
interface DSLActionCommon extends DSLNodeBase {
  type: 'action';
  map?: Record<string, string>;
  params?: Record<string, any>;
}

/**
 * An action step names an Action, or carries its own code — never both, and never neither.
 *
 * A union rather than optional fields, so the compiler refuses the combinations instead of the validator
 * reporting them. This is only possible because the step ships hand-written helpers: the `primaryField`
 * codegen scrapes `export interface DSL*Node` out of this file and would not find one.
 */
export type DSLActionNode =
  | (DSLActionCommon & { action: string; mode?: 'template'; actionFn?: never })
  | (DSLActionCommon & { mode: 'code'; actionFn: string; action?: never });

/**
 * Everything but the primary field, for each helper's `opts`.
 *
 * A mapped type rather than `Omit`, for the reason `generate-entries` gives where it emits the same shape:
 * `DSLNodeBase`'s index signature makes `keyof` every string, so `Omit` collapses to that index signature and
 * takes the declared fields' types with it — `params: 'a string'` would then compile. The external pack's
 * `@ts-expect-error` on exactly that case is what caught it.
 */
type OptsOf<T> = { [K in keyof T as K extends 'type' ? never : K]: T[K] };
export type DSLActionOpts = OptsOf<DSLActionCommon> & { mode?: 'template' };
export type DSLActionCodeOpts = OptsOf<DSLActionCommon>;

export interface ActionNode extends NodeBase {
  nodeType: 'action';
  mode?: 'template' | 'code';
  actionId?: string;
  actionFn?: string;
  params?: Record<string, any>;
  fieldMappings?: FieldMapping[];
}
