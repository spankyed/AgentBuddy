// The transform step runs its script as an action runs (services.action.executeAction) with the previous step's result
// and its mapped fields, and completes with the returned value per its outputType
import { describe, expect, it } from 'vitest';
import { importFlows, startApp } from '@abuddy/testing/harness';
import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { on, transform } from '@/__generated__/flow-helpers';
import { handler } from '@/extensions/steps/transform/runtime';

type Sent = { type: string; result?: unknown; error?: { message?: string } };

function run(node: Record<string, unknown>, lastResult?: unknown) {
  const sent: Sent[] = [];
  const actor = { send: (event: Sent) => sent.push(event) };
  const tNode = { id: 'TNode-transform', nodeAttributes: {} } as unknown as TNodeEntity;
  const ctx = { lastStep: { label: 'previous', result: lastResult } } as ExecutionContext;
  return handler(tNode, { label: 'Shape', nodeType: 'transform', ...node }, ctx, actor).then(() => sent);
}

describe('transform step', () => {
  it("completes with the script's JSON value, from the previous step's result as params.input", async () => {
    const sent = await run({ script: 'return { total: params.input.items.length, at: new Date(0) }', outputType: 'json' }, { items: [1, 2, 3] });

    // A Date becomes its JSON string: the result is the value as JSON holds it
    expect(sent).toEqual([{ type: 'COMPLETE', result: { total: 3, at: '1970-01-01T00:00:00.000Z' } }]);
  });

  it('defaults to json and fails when the returned value isn\'t JSON-serializable', async () => {
    const sent = await run({ script: 'return undefined' });

    expect(sent).toEqual([expect.objectContaining({ type: 'ERROR', error: expect.objectContaining({ message: expect.stringContaining('Transform step "Shape": the script returned undefined, which isn\'t JSON-serializable') }) })]);
  });

  it('completes with String(value) for text', async () => {
    const sent = await run({ script: 'return params.input.count * 2', outputType: 'text' }, { count: 21 });

    expect(sent).toEqual([{ type: 'COMPLETE', result: '42' }]);
  });

  it('completes with the value as returned for custom', async () => {
    const sent = await run({ script: 'return { at: new Date(0), size: new Map([["a", 1]]).size }', outputType: 'custom' });

    expect(sent).toEqual([{ type: 'COMPLETE', result: { at: new Date(0), size: 1 } }]);
    expect((sent[0].result as { at: unknown }).at).toBeInstanceOf(Date);
  });

  it("fails the step with the script's error message", async () => {
    const sent = await run({ script: 'throw new Error("no items to shape")' });

    expect(sent).toEqual([expect.objectContaining({ type: 'ERROR', error: expect.objectContaining({ message: expect.stringMatching(/^Transform step "[^"]+" script failed: .*no items to shape/) }) })]);
  });

  it('runs in a flow with the previous step\'s result and its mapped fields, and the next step reads its result', async () => {
    importFlows({
      Shaping: {
        root: true,
        tracks: [
          on('go', [[
            transform('return { words: params.input.text.split(" ") }', { label: 'split', map: { input: '$.event.data.payload' } }),
            transform('return params.input.words.length + " words, " + params.greeting', { label: 'count', outputType: 'text', map: { greeting: 'hi' } }),
          ]]),
        ],
      },
    });
    const app = await startApp({ systems: ['brain'] });

    const run = await app.runFlow('Shaping', { event: 'go', data: { text: 'one two three' } });

    expect(run.steps.map((s) => [s.label, s.status, s.nodeAttributes.result])).toEqual([
      ['split', 'completed', { words: ['one', 'two', 'three'] }],
      ['count', 'completed', '3 words, hi'],
    ]);
  });
});
