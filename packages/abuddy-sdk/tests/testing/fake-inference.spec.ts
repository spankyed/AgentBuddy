// fakeInference runs the AI SDK's real calls on a scripted model and records what the model received
import { describe, expect, it } from 'vitest';
import { isStepCount, Output, tool } from 'ai';
import { z } from 'zod';
import { fakeInference, startTestRuntime } from '../../src/testing/index.ts';
import { inference as hostInference } from '../../src/services/inference.ts';

describe('fakeInference', () => {
  it('answers generateText with its reply and records the call', async () => {
    const inference = fakeInference('Hello from the fake');
    const result = await inference.generateText({ model: 'anthropic:claude-sonnet-4-5', instructions: 'Be brief', prompt: 'Say hello' });
    expect(result.text).toBe('Hello from the fake');
    expect(result.finishReason).toBe('stop');
    expect(inference.calls).toEqual([{ kind: 'text', model: 'anthropic:claude-sonnet-4-5', instructions: 'Be brief', messages: [{ role: 'user', text: 'Say hello' }], tools: [], stream: false }]);
  });

  it('parses structured output from a JSON reply', async () => {
    const inference = fakeInference(JSON.stringify({ intent: 'buy', confidence: 0.9 }));
    const { output } = await inference.generateText({
      model: 'openai:gpt-5',
      prompt: 'Classify: buy milk',
      output: Output.object({ schema: z.object({ intent: z.string(), confidence: z.number() }) }),
    });
    expect(output).toEqual({ intent: 'buy', confidence: 0.9 });
  });

  describe('output given as data', () => {
    const Weather = z.object({ city: z.string(), temperature: z.number() });

    it.each([
      ['object', { type: 'object', schema: Weather }, { city: 'Paris', temperature: 21 }, { city: 'Paris', temperature: 21 }],
      ['array', { type: 'array', element: Weather, minItems: 1 }, { elements: [{ city: 'Paris', temperature: 21 }] }, [{ city: 'Paris', temperature: 21 }]],
      ['choice', { type: 'choice', options: ['bug', 'feature'] }, { result: 'bug' }, 'bug'],
      ['json', { type: 'json' }, { any: ['shape'] }, { any: ['shape'] }],
    ] as const)('parses a %s spec as its Output would', async (_kind, output, reply, expected) => {
      const inference = fakeInference(JSON.stringify(reply));
      const result = await inference.generateText({ model: 'openai:gpt-5', prompt: 'x', output });
      expect(result.output).toEqual(expected);
    });

    it('treats a text spec as text', async () => {
      const inference = fakeInference('plain words');
      expect((await inference.generateText({ model: 'openai:gpt-5', prompt: 'x', output: { type: 'text' } })).output).toBe('plain words');
    });

    it('rejects a reply its spec rejects', async () => {
      const inference = fakeInference(JSON.stringify({ result: 'question' }));
      await expect(inference.generateText({ model: 'openai:gpt-5', prompt: 'x', output: { type: 'choice', options: ['bug', 'feature'] } })).rejects.toThrow();
    });

    it('streams partial output for a spec', async () => {
      const inference = fakeInference(JSON.stringify({ city: 'Paris', temperature: 21 }));
      const result = await inference.streamText({ model: 'openai:gpt-5', prompt: 'x', output: { type: 'object', schema: Weather } });
      const partials: unknown[] = [];
      for await (const partial of result.partialOutputStream) partials.push(partial);
      expect(partials.at(-1)).toEqual({ city: 'Paris', temperature: 21 });
      expect(await result.output).toEqual({ city: 'Paris', temperature: 21 });
    });

    it('passes an Output from ai through unchanged', async () => {
      const inference = fakeInference(JSON.stringify({ result: 'feature' }));
      const result = await inference.generateText({ model: 'openai:gpt-5', prompt: 'x', output: Output.choice({ options: ['bug', 'feature'] }) });
      expect(result.output).toBe('feature');
    });
  });

  it('runs the tools a reply calls, then answers the next step', async () => {
    const executed: string[] = [];
    const lookup = tool({ description: 'Look up a word', inputSchema: z.object({ word: z.string() }), execute: async ({ word }) => { executed.push(word); return `${word} means dairy`; } });
    const inference = fakeInference((call) => call.messages.some((m) => m.role === 'tool')
      ? 'Milk is dairy'
      : { toolCalls: [{ toolName: 'lookup', input: { word: 'milk' } }] });

    const result = await inference.generateText({ model: 'openai:gpt-5', prompt: 'What is milk?', tools: { lookup }, stopWhen: isStepCount(3) });

    expect(executed).toEqual(['milk']);
    expect(result.text).toBe('Milk is dairy');
    expect(inference.calls).toHaveLength(2);
    expect(inference.calls[0]).toMatchObject({ kind: 'text', tools: ['lookup'] });
    expect(inference.calls[1]).toHaveProperty('messages', [
      { role: 'user', text: 'What is milk?' },
      { role: 'assistant', text: JSON.stringify({ toolName: 'lookup', input: { word: 'milk' } }) },
      { role: 'tool', text: JSON.stringify({ type: 'text', value: 'milk means dairy' }) },
    ]);
  });

  it('streams its reply through streamText', async () => {
    const inference = fakeInference('Streamed text');
    const result = await inference.streamText({ model: 'google:gemini-2.5-pro', prompt: 'Stream' });
    const deltas: string[] = [];
    for await (const part of result.stream) if (part.type === 'text-delta') deltas.push(part.text);
    expect(deltas.join('')).toBe('Streamed text');
    expect(await result.text).toBe('Streamed text');
    expect(inference.calls).toEqual([expect.objectContaining({ model: 'google:gemini-2.5-pro', stream: true })]);
  });

  it('runs an agent: its instructions, tools and structured output across steps', async () => {
    const searched: string[] = [];
    const search = tool({ description: 'Search notes', inputSchema: z.object({ query: z.string() }), execute: async ({ query }) => { searched.push(query); return ['Buy milk'] } });
    const inference = fakeInference((call) => call.messages.some((m) => m.role === 'tool')
      ? JSON.stringify({ tasks: ['Buy milk'] })
      : { toolCalls: [{ toolName: 'search', input: { query: 'todo' } }] });

    const agent = await inference.createAgent({
      model: 'anthropic:claude-opus-5',
      instructions: 'Find my tasks',
      tools: { search },
      output: { type: 'object', schema: z.object({ tasks: z.array(z.string()) }) },
    });
    const result = await agent.generate({ prompt: 'What do I need to do?' });

    expect(searched).toEqual(['todo']);
    expect(result.output).toEqual({ tasks: ['Buy milk'] });
    expect(inference.calls).toEqual([
      expect.objectContaining({ kind: 'text', model: 'anthropic:claude-opus-5', instructions: 'Find my tasks', tools: ['search'] }),
      expect.objectContaining({ kind: 'text', model: 'anthropic:claude-opus-5' }),
    ]);
  });

  it('embeds values with the scripted vectors', async () => {
    const inference = fakeInference('unused', { embedding: (value) => [value.length, 0] });
    expect((await inference.embed({ model: 'openai:text-embedding-3-small', value: 'milk' })).embedding).toEqual([4, 0]);
    expect((await inference.embedMany({ model: 'cohere:embed-v4.0', values: ['a', 'bread'] })).embeddings).toEqual([[1, 0], [5, 0]]);
    expect(inference.calls).toEqual([
      { kind: 'embedding', model: 'openai:text-embedding-3-small', values: ['milk'] },
      { kind: 'embedding', model: 'cohere:embed-v4.0', values: ['a', 'bread'] },
    ]);
  });

  it('generates images, speech and transcripts from the scripted replies, with defaults', async () => {
    const inference = fakeInference('unused', { transcript: 'Buy milk' });

    const { images } = await inference.generateImage({ model: 'openai:gpt-image-1', prompt: 'A carton of milk', n: 2 });
    expect(images.map((image) => image.mediaType)).toEqual(['image/png', 'image/png']);
    const { audio } = await inference.generateSpeech({ model: 'mistral:voxtral-mini-tts-latest', text: 'Buy milk', voice: 'alloy' });
    expect(audio.uint8Array.length).toBeGreaterThan(0);
    expect((await inference.transcribe({ model: 'groq:whisper-large-v3', audio: audio.uint8Array })).text).toBe('Buy milk');

    expect(inference.calls).toEqual([
      { kind: 'image', model: 'openai:gpt-image-1', prompt: 'A carton of milk', n: 2 },
      { kind: 'speech', model: 'mistral:voxtral-mini-tts-latest', text: 'Buy milk', voice: 'alloy' },
      expect.objectContaining({ kind: 'transcription', model: 'groq:whisper-large-v3' }),
    ]);
  });

  it("is what unmocked tests don't have: the test host's inference fails naming the fix", async () => {
    startTestRuntime();
    await expect(hostInference.generateText({ model: 'openai:gpt-5', prompt: 'hi' })).rejects.toThrow('mock inference with mockInference(reply)');
    await expect(hostInference.streamText({ model: 'openai:gpt-5', prompt: 'hi' })).rejects.toThrow('No models in unit tests');
    await expect(hostInference.createAgent({ model: 'openai:gpt-5' })).rejects.toThrow('No models in unit tests');
    await expect(hostInference.embed({ model: 'openai:text-embedding-3-small', value: 'hi' })).rejects.toThrow('No models in unit tests');
  });
});
