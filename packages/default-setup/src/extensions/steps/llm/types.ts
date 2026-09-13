import type { DSLNodeBase, NodeBase } from '@abuddy/sdk/build';

export interface DSLLLMNode extends DSLNodeBase {
  type: 'llm';
  prompt: string;
  map?: Record<string, string>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LLMNode extends NodeBase {
  nodeType: 'llm';
  prompt?: string;
  promptTemplateId?: string;
  fieldMappings?: Array<{ target: string; source: string; default?: any }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}
