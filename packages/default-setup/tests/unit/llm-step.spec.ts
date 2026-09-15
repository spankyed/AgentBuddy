// The llm step asks services.inference for the node's model, prompt and settings, and completes with the text
import { describe, expect, it } from 'vitest';
import { mockInference } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';
import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { handler } from '../../src/extensions/steps/llm/runtime';
import { DEFAULT_MODEL } from '../../src/extensions/steps/llm/model';
import { llmStepFE } from '../../src/extensions/steps/llm/fe';
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
