export type { EARS, BaseEntity } from '../.abuddy/generated/ears';
export type { ActionMeta, ActionParameter, PromptMeta, TemplateInput } from '@abuddy/sdk/build';
export type { DSLStepNode, FlowDSL, Track } from '@abuddy/sdk/build';

import type { EARS as _EARS } from '../.abuddy/generated/ears';
export type EntityId = _EARS.EntityId;

import type { DSLStepNode } from '@abuddy/sdk/build';

export interface DSLDelayNode {
  type: 'delay';
  duration: number;
  label?: string;
  description?: string;
  final?: boolean;
  next?: string;
}

export type PackStepNode = DSLStepNode | DSLDelayNode;
