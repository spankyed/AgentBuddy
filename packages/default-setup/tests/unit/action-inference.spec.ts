// Actions run sandboxed and can't import `ai`, yet reach all of services.inference: output as data, tools as
// plain objects (ai's tool() returns its argument) and stopWhen as a function
import { describe, expect, it } from 'vitest';
import { mockInference } from '@abuddy/testing/harness';
import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { services } from '@/__generated__/services';
import { handler } from '../../src/extensions/steps/action/runtime';

/** Runs inline action code on the action step, as a flow node in code mode does */
async function runAction(actionFn: string) {
  const sent: Array<{ type: string; result?: unknown; error?: { message?: string } }> = [];
  const node = { id: 'Node-action', label: 'Classify', nodeType: 'action', mode: 'code', actionFn };
  const ctx = { event: { type: 'issue.opened' }, steps: {}, runtime: { getAppServices: () => services } } as unknown as ExecutionContext;
  await handler({ id: 'TNode-action', nodeAttributes: {} } as unknown as TNodeEntity, node, ctx, { send: (event: (typeof sent)[number]) => sent.push(event) });
  return sent;
}

describe('actions calling services.inference', () => {
  it('get structured output from an output spec built with the injected zod', async () => {
    const inference = mockInference(JSON.stringify({ label: 'bug', confidence: 0.9 }));

    const sent = await runAction(`
      const { output } = await services.inference.generateText({
        model: 'openai:gpt-5-mini',
        prompt: 'Label: the app crashes on start',
        output: { type: 'object', schema: z.object({ label: z.enum(['bug', 'feature']), confidence: z.number() }) },
      });
      return output;
    `);

    expect(sent).toEqual([{ type: 'COMPLETE', result: { label: 'bug', confidence: 0.9 } }]);
  });

  it('pick one of several options with a choice spec', async () => {
    mockInference(JSON.stringify({ result: 'feature' }));
    const sent = await runAction(`
      const { output } = await services.inference.generateText({ model: 'openai:gpt-5-mini', prompt: 'Label: add dark mode', output: { type: 'choice', options: ['bug', 'feature'] } });
      return output;
    `);
    expect(sent).toEqual([{ type: 'COMPLETE', result: 'feature' }]);
  });

  it('run tools given as plain objects, stopping with a stopWhen function', async () => {
    const inference = mockInference((call) => call.messages.some((m) => m.role === 'tool')
      ? 'It is a bug'
      : { toolCalls: [{ toolName: 'searchIssues', input: { query: 'crash' } }] });

    const sent = await runAction(`
      const searched = [];
      const { text } = await services.inference.generateText({
        model: 'openai:gpt-5-mini',
        prompt: 'Is this a known bug?',
        tools: {
          searchIssues: {
            description: 'Search known issues',
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }) => { searched.push(query); return ['#12 crash on start']; },
          },
        },
        stopWhen: ({ steps }) => steps.length >= 3,
      });
      return { text, searched };
    `);

    expect(sent).toEqual([{ type: 'COMPLETE', result: { text: 'It is a bug', searched: ['crash'] } }]);
    expect(inference.calls).toHaveLength(2);
  });
});
