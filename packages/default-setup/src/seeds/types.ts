import type { z } from 'zod';
import { EARS } from '@abuddy/sdk';
import type { featureServices } from '@/__generated__/services';

export type Services = typeof featureServices;
export type Z = typeof z;
export type EntityId = EARS.EntityId;

export type {
  FlowDSL, FlowConfig, Track, DSLStepNode,
  ActionParameter, ActionMeta, TemplateInput, PromptMeta,
} from '@abuddy/sdk/build';
