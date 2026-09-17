import type { NodeBase } from '@abuddy/sdk';
import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { ModelId } from '@abuddy/sdk/models';

export interface DSLLLMNode extends DSLNodeBase {
  type: 'llm';
  prompt: string;
  map?: Record<string, string>;
  model?: ModelId;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LLMNode extends NodeBase {
  nodeType: 'llm';
  prompt?: string;
  promptTemplateId?: string;
  fieldMappings?: Array<{ target: string; source: string; default?: any }>;
  model?: ModelId;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}
