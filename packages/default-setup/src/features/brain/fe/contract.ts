// The brain plugin's contract. It declares no inbox: nothing outside the feature sends it events, and its own
// system's outgoing union already reaches it. What it publishes is its state.
//
// A leaf: no machine, no other feature, and nothing from `#generated/*` but `types` and `ears`.
// `abuddy.json` names it at `features[].plugin.contract`.
import type { EventListenerEntity } from '@/__generated__/types'
import type { StepRuntimeError, TNodeEntity, TrackTree } from '@abuddy/sdk/steps'
import type { NormalizedTNodeTree } from './trace-tree'

export interface BrainContext {
  flowTNodeId?: string;
  tNodeTree?: TrackTree[];
  normalizedTree?: NormalizedTNodeTree;
  possibleEvents: EventListenerEntity[];
  flowHierarchy: Array<{ flowTNodeId: string; label: string }>;
  pulsingEventType?: string;
  // UI state
  showLeftPanel: boolean;
  selectedStepNode?: TNodeEntity;
  inspectEnabled: boolean;
  animationsEnabled: boolean;
  brainIsDead: boolean;
  /** Why the brain couldn't start, while it stays stopped for that reason */
  startError?: string;
  /** The root flow the running brain started with; the flows plugin's root flow differing from it takes a restart */
  runningRootFlowId?: string;
  brainIsPaused: boolean;
  latestRuntimeError?: StepRuntimeError;
  runtimeErrors: StepRuntimeError[];
  // Settings
  settings?: any; // BrainSettings
}

export type Contract = {
  state: BrainContext
}
