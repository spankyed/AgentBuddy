export type { ValidationError, ValidationResult } from '../seed-compiler';

export interface DSLStepNode {
  type: string;
  label?: string;
  description?: string;
  final?: boolean;
  next?: string;
  [key: string]: unknown;
}

export type FlowDSL = Record<string, Track[] | FlowConfig>;

export interface FlowConfig {
  tracks: Track[];
  root?: boolean;
  sourceHash?: string;
}

export interface Track {
  event?: string;
  schedule?: string;
  label?: string;
  description?: string;
  exits: DSLStepNode[][];
}

export function isFlowConfig(value: Track[] | FlowConfig): value is FlowConfig {
  return !Array.isArray(value);
}

export function resolveTracks(entry: Track[] | FlowConfig): Track[] {
  return isFlowConfig(entry) ? entry.tracks : entry;
}

export const ROOT_FLOW_ROLE = 'root_flow';
