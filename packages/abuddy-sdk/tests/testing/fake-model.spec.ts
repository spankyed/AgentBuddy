// fakeModel scripts the model @abuddy/sdk/inference runs the AI SDK against
import * as os from 'node:os';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fakeModel, restoreModelProvider, startTestRuntime } from '../../src/testing/index.ts';
import { generateText, streamText, tool } from '../../src/services/inference.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
startTestRuntime();

describe('fakeModel', () => {
  it('fails inference naming fakeModel until a test scripts one', async () => {
    await expect(generateText({ model: { provider: 'anthropic', model: 'claude' }, prompt: 'hi' })).rejects.toThrow('call fakeModel()');
  });

  it('answers generateText and records the call', async () => {
    const model = fakeModel('Hello from the fake');
    const result = await generateText({ model: { provider: 'anthropic', model: 'claude-x' }, system: 'Be brief', prompt: 'Say hello' });
    expect(result.text).toBe('Hello from the fake');
    expect(model.calls).toEqual([{ model: { provider: 'anthropic', model: 'claude-x' }, system: 'Be brief', messages: [{ role: 'user', text: 'Say hello' }], tools: [], stream: false }]);
  });

  it('streams its reply', async () => {
    const model = fakeModel((call) => `echo: ${call.messages[0].text}`);
    const result = await streamText({ model: { provider: 'openai.responses', model: 'gpt' }, prompt: 'ping' });
    let text = '';
    for await (const delta of result.textStream) text += delta;
    expect(text).toBe('echo: ping');
    expect(model.calls[0].stream).toBe(true);
  });

  it('restoreModelProvider puts back the failing default', async () => {
    fakeModel('scripted');
    restoreModelProvider();
    await expect(generateText({ model: { provider: 'anthropic', model: 'claude' }, prompt: 'hi' })).rejects.toThrow('call fakeModel()');
  });

  it("calls the code's tools and answers with their results", async () => {
    const model = fakeModel((call) => call.messages.some((m) => m.role === 'tool')
      ? `The memo count is ${call.messages.find((m) => m.role === 'tool')!.text}`
      : { toolCalls: [{ toolName: 'countMemos', args: { tag: 'work' } }] });
    const countMemos = tool({ description: 'Counts memos', parameters: z.object({ tag: z.string() }), execute: async ({ tag }) => (tag === 'work' ? 3 : 0) });
    const result = await generateText({ model: { provider: 'anthropic', model: 'claude' }, prompt: 'How many work memos?', tools: { countMemos }, maxSteps: 2 });
    expect(result.text).toBe('The memo count is 3');
    expect(model.calls.map((call) => call.tools)).toEqual([['countMemos'], ['countMemos']]);
  });
});
