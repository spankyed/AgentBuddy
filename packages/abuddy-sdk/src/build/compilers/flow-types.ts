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

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
