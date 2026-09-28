import type { NodeBase } from '@abuddy/sdk';
import type { DSLNodeBase } from '@abuddy/sdk/build';
import type { ModelId } from '@abuddy/sdk/models';

/**
 * **Provisional — the LLM step's authoring surface is still being designed.**
 *
 * The step runs: its handler is covered by `tests/extensions/steps/llm/step.spec.ts` and the editor offers it
 * in the palette. What is unsettled is how a flow *author* names one. As of this writing the `llm()` helper has
 * no call site anywhere in the repo — no seed flow, no spec, no doc example — so every field below is a design
 * proposal that nothing has exercised end to end, and the shape may change without a migration being owed.
 *
 * Prefer `action()` with a prompt-running action until that settles. Reach for this and you are the first, so
 * expect to find the rough edges; say so rather than working around them quietly.
 */
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
