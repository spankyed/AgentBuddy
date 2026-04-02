/**
 * Flow DSL runtime utilities used by the compiler.
 * These are trivial functions that mirror the API's flow DSL helpers.
 */

import type { FlowConfig, Track } from '../defs/default-setup-defs';

/** Type guard: distinguish FlowConfig from bare Track[] */
export function isFlowConfig(value: Track[] | FlowConfig): value is FlowConfig {
  return !Array.isArray(value);
}

/** Extract tracks from a FlowDSL entry (normalizes both formats) */
export function resolveTracks(entry: Track[] | FlowConfig): Track[] {
  return isFlowConfig(entry) ? entry.tracks : entry;
}

/** Role string for the root flow designation */
export const ROOT_FLOW_ROLE = 'root_flow';
