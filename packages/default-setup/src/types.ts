import type { z } from 'zod';
import type { EARS } from '../defs/ears-types';
import type { Services as ImportedServices } from '../defs/action-defs';

export type Services = ImportedServices;
export type Z = typeof z;
export type EntityId = EARS.EntityId;

export {
  type FlowDSL,
  type FlowConfig,
  type Track,
  type DSLStepNode,
  type DSLActionNode,
  type DSLLLMNode,
  type DSLSwitchNode,
  type DSLSwitchCondition,
  type DSLFireNode,
  type DSLTransformNode,
  type DSLQueryNode,
  type DSLFlowNode,
  type DSLCreateNode,
  type DSLUpdateNode,
  type DSLKeepAliveNode,
  isFlowConfig,
} from '../defs/flow-dsl-types';

export interface ActionParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  description?: string;
  required?: boolean;
  default?: any;
  placeholder?: string;
}

export interface ActionMeta {
  label: string;
  description?: string;
  category?: string;
  input: Record<string, ActionParameter>;
  output?: any;
}

export interface TemplateInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  description?: string;
  required?: boolean;
  defaultValue?: any;
  commonSources?: string[];
  example?: any;
}

export interface PromptMeta {
  label: string;
  description?: string;
  category?: string;
  inputs: Record<string, TemplateInput>;
  outputSchema?: any;
}
