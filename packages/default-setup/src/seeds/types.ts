import type { z } from 'zod';
import { EARS } from '@abuddy/sdk';
import type { ActionParameter } from '@/plugins/actions/be/types';
import type { TemplateInput } from '@/plugins/prompts/be/types';
import type { featureServices } from '@/registries/services';

export type Services = typeof featureServices;
export type Z = typeof z;
export type EntityId = EARS.EntityId;
export type { ActionParameter, TemplateInput };

export type {
  FlowDSL,
  FlowConfig,
  Track,
  DSLStepNode,
  DSLActionNode,
  DSLLLMNode,
  DSLSwitchNode,
  DSLSwitchCondition,
  DSLFireNode,
  DSLTransformNode,
  DSLQueryNode,
  DSLFlowNode,
  DSLCreateNode,
  DSLUpdateNode,
  DSLKeepAliveNode,
} from '@/plugins/flows/be/dsl/types';

export interface ActionMeta {
  label: string;
  description?: string;
  category?: string;
  input: Record<string, ActionParameter>;
  output?: any;
}

export interface PromptMeta {
  label: string;
  description?: string;
  category?: string;
  inputs: Record<string, TemplateInput>;
  outputSchema?: any;
}
