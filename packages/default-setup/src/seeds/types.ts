import type { z } from 'zod';
import { EARS } from '@abuddy/sdk';
import type { ActionParameter } from '@/features/actions/be/types';
import type { TemplateInput } from '@/features/prompts/be/types';
import type { featureServices } from '@/__generated__/services';

export type Services = typeof featureServices;
export type Z = typeof z;
export type EntityId = EARS.EntityId;
export type { ActionParameter, TemplateInput };

export type { FlowDSL, FlowConfig, Track, DSLStepNode } from '@abuddy/sdk/build';
export type { DSLActionNode } from '@/extensions/steps/action/types';
export type { DSLLLMNode } from '@/extensions/steps/llm/types';
export type { DSLSwitchNode, DSLSwitchCondition } from '@/extensions/steps/switch/types';
export type { DSLFireNode } from '@/extensions/steps/fire/types';
export type { DSLTransformNode } from '@/extensions/steps/transform/types';
export type { DSLQueryNode } from '@/extensions/steps/query/types';
export type { DSLFlowNode } from '@/extensions/steps/flow/types';
export type { DSLCreateNode } from '@/extensions/steps/create/types';
export type { DSLUpdateNode } from '@/extensions/steps/update/types';
export type { DSLKeepAliveNode } from '@/extensions/steps/keep-alive/types';

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
