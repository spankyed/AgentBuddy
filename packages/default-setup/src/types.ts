import type { z } from 'zod';
import type { EARS, ActionParameter, TemplateInput } from '../defs/default-setup-defs';
import type { Services as ImportedServices } from '../defs/action-defs';

export type Services = ImportedServices;
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
} from '../defs/default-setup-defs';

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
