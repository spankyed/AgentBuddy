export type {
  EARS,
  EntityId,
  Services,
  Z,
  ActionMeta,
  PromptMeta,
  ActionParameter,
  TemplateInput,
} from '../.abuddy/generated/types';

import type { DSLStepNode } from '../.abuddy/generated/types';

interface DSLDelayNode {
  type: 'delay';
  duration: number;
  label?: string;
  description?: string;
  final?: boolean;
  next?: string;
}

export type PackStepNode = DSLStepNode | DSLDelayNode;

interface PackTrack {
  event?: string;
  schedule?: string;
  label?: string;
  description?: string;
  exits: PackStepNode[][];
}

interface PackFlowConfig {
  tracks: PackTrack[];
  root?: boolean;
  sourceHash?: string;
}

export type FlowDSL = Record<string, PackTrack[] | PackFlowConfig>;
