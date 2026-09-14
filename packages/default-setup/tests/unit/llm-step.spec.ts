// The llm step's runtime asks the model inference resolves; the harness's fakeModel answers it
import { describe, expect, it } from 'vitest';
import { fakeModel } from '@abuddy/sdk/testing';
import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { handler } from '../../src/extensions/steps/llm/runtime';

function run(nodeAttributes: Record<string, unknown>) {
  const sent: Array<{ type: string; result?: { text?: string } }> = [];
  const actor = { send: (event: (typeof sent)[number]) => sent.push(event) };
  const tNode = { id: 'TNode-llm', nodeAttributes } as unknown as TNodeEntity;
  return handler(tNode, { label: 'Summarize' }, {} as ExecutionContext, actor).then(() => sent);
}

describe('llm step', () => {
  it('sends the node prompt and system prompt to the model and completes with its text', async () => {
    const model = fakeModel('A short summary');
    const sent = await run({ model: 'openai:gpt-4o-mini', prompt: 'Summarize the memo', systemPrompt: 'Be brief', temperature: 0.2 });
    expect(model.calls).toEqual([expect.objectContaining({
      model: { provider: 'openai', model: 'gpt-4o-mini' },
      system: 'Be brief',
      messages: [{ role: 'user', text: 'Summarize the memo' }],
    })]);
    expect(sent).toEqual([expect.objectContaining({ type: 'COMPLETE', result: expect.objectContaining({ text: 'A short summary' }) })]);
  });
});
