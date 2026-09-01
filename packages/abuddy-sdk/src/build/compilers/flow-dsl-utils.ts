import type { FlowConfig, Track } from './flow-types';

export function isFlowConfig(value: Track[] | FlowConfig): value is FlowConfig {
  return !Array.isArray(value);
}

export function resolveTracks(entry: Track[] | FlowConfig): Track[] {
  return isFlowConfig(entry) ? entry.tracks : entry;
}

export const ROOT_FLOW_ROLE = 'root_flow';
