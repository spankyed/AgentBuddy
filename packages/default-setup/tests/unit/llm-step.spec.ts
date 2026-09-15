// The llm step asks services.inference for the node's model, prompt and settings, and completes with the text
import { describe, expect, it } from 'vitest';
import { mockInference, mockService } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';
import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { handler } from '../../src/extensions/steps/llm/runtime';
import { DEFAULT_MODEL } from '../../src/extensions/steps/llm/model';
import { llmStepFE } from '../../src/extensions/steps/llm/fe';
import { validate } from '../../src/extensions/steps/llm/build';
import { availableModels } from '@abuddy/sdk/models';

function run(nodeAttributes: Record<string, unknown>) {
  const sent: Array<{ type: string; result?: { text?: string }; error?: { message?: string } }> = [];
  const actor = { send: (event: (typeof sent)[number]) => sent.push(event) };
  const tNode = { id: 'TNode-llm', nodeAttributes } as unknown as TNodeEntity;
  return handler(tNode, { label: 'Summarize' }, {} as ExecutionContext, actor).then(() => sent);
}

describe('llm step', () => {
  it("sends the node's model, system prompt and prompt to inference and completes with its text", async () => {
    const inference = mockInference('A short summary');

    const sent = await run({ model: 'openai:gpt-4o-mini', prompt: 'Summarize the memo', systemPrompt: 'Be brief', temperature: 0.2 });

    expect(inference.calls).toEqual([{ kind: 'text', model: 'openai:gpt-4o-mini', instructions: 'Be brief', messages: [{ role: 'user', text: 'Summarize the memo' }], tools: [], stream: false }]);
    expect(sent).toEqual([expect.objectContaining({ type: 'COMPLETE', result: expect.objectContaining({ text: 'A short summary' }) })]);
  });

  it('runs the default model when the node names none', async () => {
    const inference = mockInference('ok');
    await run({ prompt: 'Summarize the memo' });
    expect(inference.calls[0].model).toBe(DEFAULT_MODEL);
  });

  it("keeps the provider's warnings on its result, as when the model ignores the node's temperature", async () => {
    const inference = mockInference('ok');
    const warnings = [{ type: 'unsupported', feature: 'temperature', details: 'temperature is not supported for reasoning models' }];
    const options: Array<Record<string, unknown>> = [];
    // The fake model reports no warnings; a provider's arrive on the result
    mockService('inference', {
      generateText: async (call: Parameters<typeof inference.generateText>[0]) => {
        options.push(call);
        const { text, usage, finishReason } = await inference.generateText(call);
        return { text, usage, finishReason, warnings };
      },
    } as never);

    const sent = await run({ model: 'anthropic:claude-opus-5', prompt: 'Summarize the memo', temperature: 0.7 });

    expect(options[0].temperature).toBe(0.7);
    expect(sent).toEqual([expect.objectContaining({ type: 'COMPLETE', result: expect.objectContaining({ text: 'ok', warnings }) })]);
  });

  it("sends no temperature for a node that sets none, and a new node sets none", async () => {
    const inference = mockInference('ok');
    const options: Array<Record<string, unknown>> = [];
    mockService('inference', {
      generateText: async (call: Parameters<typeof inference.generateText>[0]) => {
        options.push(call);
        return inference.generateText(call);
      },
    } as never);

    const sent = await run({ prompt: 'Summarize the memo' });

    expect(options[0].temperature).toBeUndefined();
    expect(sent).toEqual([expect.objectContaining({ type: 'COMPLETE', result: expect.not.objectContaining({ warnings: expect.anything() }) })]);
    expect(llmStepFE.fe?.defaults).not.toHaveProperty('temperature');
  });

  it("fails the step, naming the node, when its model isn't provider:model", async () => {
    const inference = mockInference('unused');

    const sent = await run({ model: 'gpt-4-turbo', prompt: 'Summarize the memo' });

    expect(sent).toEqual([expect.objectContaining({ type: 'ERROR', error: expect.objectContaining({ message: `LLM node "Summarize" names model "gpt-4-turbo": expected provider:model, e.g. ${DEFAULT_MODEL}` }) })]);
    expect(inference.calls).toEqual([]);
  });
});

describe('llm step models from the editor', () => {
  it('runs each model the flows editor offers with the id the form stores', async () => {
    const { models } = repository.flowsQueries.connectedData();
    expect(models.length).toBeGreaterThan(0);
    for (const entry of models) {
      const inference = mockInference('ok');
      // The llm form stores the chosen catalog entry's id as the node's model
      const sent = await run({ model: entry.id, prompt: 'Summarize the memo' });
      expect(sent, entry.id).toEqual([expect.objectContaining({ type: 'COMPLETE' })]);
      expect(inference.calls.map((call) => call.model)).toEqual([entry.id]);
    }
  });
});

describe('llm default model', () => {
  it('is a model the editor offers, for nodes that name none and for new nodes', () => {
    const catalogIds = availableModels.map((entry) => entry.id);
    expect(catalogIds).toContain(DEFAULT_MODEL);
    expect(catalogIds).toContain((llmStepFE.fe?.defaults as { model?: string } | undefined)?.model);
  });
});

describe('llm step validation', () => {
  const errors = (step: Record<string, unknown>) => validate({ prompt: 'Summary', ...step }, 'flows.Memo[0]', { prompts: new Set(['Summary']) } as never);

  it("rejects a model that isn't provider:model when the flow builds, instead of when it runs", () => {
    expect(errors({ model: 'gpt-4' })).toEqual([{ path: 'flows.Memo[0].model', message: '"model" must be a provider:model id (e.g. "anthropic:claude-opus-5"), got "gpt-4"' }]);
    expect(errors({ model: 42 })).toHaveLength(1);
  });

  it('accepts a provider:model id, in the catalog or not, and no model', () => {
    expect(errors({ model: 'openai:gpt-4o-mini' })).toEqual([]);
    expect(errors({})).toEqual([]);
  });
});
