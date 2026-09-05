/**
 * Step Definition Contracts
 *
 * A step definition bundles everything a step type needs across
 * build (compile/validate), runtime (handler), and frontend (palette/canvas).
 * Packs register step definitions into the StepRegistry so the flows
 * and brain systems dispatch to them instead of hardcoded switches.
 */

/*─────────────────────────────────────────────────────────────────
 * Build-Time Types
 *─────────────────────────────────────────────────────────────────*/

export interface StepCompileContext {
  actions: Map<string, string>;
  prompts: Map<string, string>;
  flows: Map<string, string>;
}

export interface StepRelation {
  source: string;
  kind: string;
  target: string;
  info?: Record<string, unknown>;
}

export interface StepCompileResult {
  entity: Record<string, unknown>;
  relations: StepRelation[];
}

export interface StepValidationError {
  path: string;
  message: string;
}

export interface StepValidationContext {
  actions: Set<string>;
  prompts: Set<string>;
  flowNames: Set<string>;
  nodeLabels: Set<string>;
  path: string;
  skipReferenceCheck?: boolean;
}

export interface StepBuildFacet {
  compile(node: Record<string, unknown>, nodeId: string, ts: number, ctx: StepCompileContext): StepCompileResult;
  validate(step: Record<string, unknown>, path: string, ctx: StepValidationContext): StepValidationError[];
  getLabel(step: Record<string, unknown>, index: number): string;
}

/*─────────────────────────────────────────────────────────────────
 * Runtime Types
 *─────────────────────────────────────────────────────────────────*/

export interface StepRuntimeFacet {
  /**
   * Executes the step. Params are typed as `unknown` to avoid coupling
   * the SDK to concrete brain types — cast internally to `TNodeEntity`,
   * `NodeEntity`, `ExecutionContext`, and the actor ref.
   *
   * Generic conventions the brain honours from handler results:
   * - **Branching**: `{ sourceHandle: 'branch-N' }` → routes to named branch
   * - **No-match**: `{ noMatch: true }` → terminates the current chain
   * - **Kill**: send `KILL_FLOW` to `ctx.runtime.getFlowActor(flowTNodeId)`
   * - **Keep-alive**: never send COMPLETE → actor stays in executing state
   * - **Final**: set `final: true` on the compiled node → triggers flow completion
   */
  handler?: (tNode: unknown, node: unknown, executionContext: unknown, actor: unknown) => void | Promise<void>;
  isAsync?: boolean;
  /** When true, the brain spawns a sub-flow machine instead of a step machine. */
  spawnsSubflow?: boolean;
}

/*─────────────────────────────────────────────────────────────────
 * Frontend Types
 *─────────────────────────────────────────────────────────────────*/

export interface StepNodeConfig {
  label: string;
  defaultLabel?: string;
  icon: unknown;
  color: string;
  bgColor: string;
  hoverBgColor: string;
  connectionRules: { inputs: number; outputs: number };
  component?: string;
  category: 'trigger' | 'action' | 'logic' | 'data' | 'ai';
  isImplemented?: boolean;
  isDisabled?: boolean;
}

export interface StepFEFacet {
  nodeConfig: StepNodeConfig;
  colorKey?: string;
  defaults?: Record<string, unknown>;
}

/*─────────────────────────────────────────────────────────────────
 * Step Definition
 *─────────────────────────────────────────────────────────────────*/

export interface StepDefinition {
  type: string;
  build?: StepBuildFacet;
  runtime?: StepRuntimeFacet;
  fe?: StepFEFacet;
}
