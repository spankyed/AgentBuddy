// The app's services.inference: `provider:model` ids resolve to that provider's AI SDK model, built with
// the key the user selected for the provider in Settings → Secrets. Local HTTP servers stand in for the providers.
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSONSchema7 } from 'ai';
import { availableModels, parseModelId, providerCapabilities, providerLabels, type ModelKind, type ProviderName } from '@abuddy/sdk/models';

// The app's store, on a temporary file with keys in memory
vi.mock('../../src/secrets/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/secrets/index.ts')>();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inference-secrets-'));
  const vault = actual.memoryKeyVault();
  const secretsStore = actual.createSecretsStore({ filePath: path.join(dir, 'secrets.json'), osVault: () => vault, fileVault: () => vault });
  return { ...actual, secretsStore };
});

const { secretsStore } = await import('../../src/secrets/index.ts');
const { inference, model: resolveModel } = await import('../../src/services/inference.ts');
const languageModel = (id: string) => resolveModel('language', id as never);

const PROVIDERS = Object.keys(providerLabels) as ProviderName[];

/** Stores a key for a provider as Settings → Secrets would, replacing the value of one already stored */
const secrets = {
  set(provider: string, value: string) {
    const existing = secretsStore.list().find((secret) => secret.provider === provider);
    if (existing) secretsStore.replaceValue(existing.id, value);
    else secretsStore.add(provider as ProviderName, 'Test', value);
  },
};

let server: http.Server | undefined;
beforeEach(() => {
  secretsStore.clearAll();
});
afterEach(() => {
  vi.unstubAllEnvs();
  server?.close();
});

/** An OpenAI Responses API reply with `text` as the model's output */
const openaiReply = (text: string) => ({
  id: 'resp_1', object: 'response', created_at: 0, status: 'completed', model: 'gpt-5',
  output: [{ type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }],
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
});

/** A local server answering every request with `body` (JSON, or bytes as they are), recording each request's headers and body (JSON, or text) */
async function provider(body: object): Promise<{ baseURL: string; requests: http.IncomingHttpHeaders[]; bodies: Array<Record<string, unknown>>; paths: string[] }> {
  const requests: http.IncomingHttpHeaders[] = [];
  const bodies: Array<Record<string, unknown>> = [];
  const paths: string[] = [];
  server = http.createServer((req, res) => {
    let received = '';
    req.on('data', (chunk) => { received += chunk; });
    req.on('end', () => {
      requests.push(req.headers);
      paths.push(req.url ?? '');
      bodies.push(req.headers['content-type']?.includes('json') ? JSON.parse(received) : { text: received });
      if (body instanceof Uint8Array) {
        res.setHeader('content-type', 'audio/mpeg');
        res.end(body);
      } else {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(body));
      }
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return { baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, requests, bodies, paths };
}

describe("the app's inference service", () => {
  it.each([
    ['anthropic:claude-sonnet-4-5', 'anthropic.messages'],
    ['openai:gpt-5', 'openai.responses'],
    ['google:gemini-2.5-pro', 'google.generative-ai'],
    ['groq:llama-3.3-70b-versatile', 'groq.chat'],
    ['mistral:mistral-large-latest', 'mistral.chat'],
    ['cohere:command-a-03-2025', 'cohere.chat'],
  ] as const)('resolves %s to a %s model', async (id, providerId) => {
    const parts = parseModelId(id)!;
    secrets.set(parts.provider, 'stored-key');
    const model = await languageModel(id) as { provider: string; modelId: string };
    expect(model.provider).toBe(providerId);
    expect(model.modelId).toBe(parts.model);
  });

  it("resolves every catalog model to its provider's model", async () => {
    for (const provider of PROVIDERS) secrets.set(provider, 'stored-key');
    for (const entry of availableModels) {
      const model = await languageModel(entry.id) as { provider: string; modelId: string };
      const parts = parseModelId(entry.id)!;
      expect(model.provider.split('.')[0], entry.id).toBe(parts.provider);
      expect(model.modelId).toBe(parts.model);
    }
  });

  it('resolves every kind of model each provider gives, and rejects the kinds it does not', async () => {
    const kinds: ModelKind[] = ['language', 'embedding', 'image', 'speech', 'transcription', 'reranking'];
    for (const provider of PROVIDERS) secrets.set(provider, 'stored-key');
    for (const [provider, gives] of Object.entries(providerCapabilities)) {
      for (const kind of kinds) {
        const id = `${provider}:some-model` as never;
        if ((gives as readonly ModelKind[]).includes(kind)) {
          const resolved = await resolveModel(kind, id) as { provider: string; modelId: string };
          expect(resolved.provider.split('.')[0], `${provider} ${kind}`).toBe(provider);
          expect(resolved.modelId).toBe('some-model');
        } else {
          await expect(resolveModel(kind, id), `${provider} ${kind}`).rejects.toThrow(`${providerLabels[provider as keyof typeof providerLabels]} doesn't provide ${kind} models`);
        }
      }
    }
  });

  it('rejects an id whose provider it has no model for', async () => {
    await expect(languageModel('nope:model' as never)).rejects.toThrow('Unknown model provider in "nope:model"');
    await expect(languageModel('gpt-5' as never)).rejects.toThrow('as provider:model');
  });

  it("names the provider and where to add a key when the user hasn't stored one, whatever the environment holds", async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-anthropic-key');
    await expect(languageModel('anthropic:claude-sonnet-4-5')).rejects.toThrow('No Anthropic key: add one in Settings → Secrets');
    await expect(languageModel('google:gemini-pro-latest')).rejects.toThrow('No Google key: add one in Settings → Secrets');
  });

  it('names the keys to choose from when none is selected', async () => {
    const work = secretsStore.add('openai', 'Work', 'sk-work-1234567890');
    secretsStore.add('openai', 'Personal', 'sk-personal-0987654321');
    secretsStore.delete(work.id);
    await expect(languageModel('openai:gpt-5')).rejects.toThrow('No OpenAI key selected (Personal): choose one in Settings → Secrets');
  });

  it('calls Anthropic with the key stored for it', async () => {
    const { baseURL, requests } = await provider({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-4-5',
      content: [{ type: 'text', text: 'Hello from Anthropic' }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    vi.stubEnv('ANTHROPIC_BASE_URL', baseURL);
    secrets.set('anthropic', 'stored-anthropic-key');

    const result = await inference.generateText({ model: 'anthropic:claude-sonnet-4-5', prompt: 'hi' });

    expect(result.text).toBe('Hello from Anthropic');
    expect(requests.map((headers) => headers['x-api-key'])).toEqual(['stored-anthropic-key']);
  });

  it("calls OpenAI with the selected key, switching on the next call when another is selected", async () => {
    const { baseURL, requests } = await provider(openaiReply('Hello from OpenAI'));
    vi.stubEnv('OPENAI_BASE_URL', baseURL);
    vi.stubEnv('OPENAI_API_KEY', 'env-openai-key');
    secretsStore.add('openai', 'Work', 'sk-work-1234567890');
    const personal = secretsStore.add('openai', 'Personal', 'sk-personal-0987654321');

    const result = await inference.generateText({ model: 'openai:gpt-5', prompt: 'hi' });
    secretsStore.select(personal.id);
    await inference.generateText({ model: 'openai:gpt-5', prompt: 'hi' });

    expect(result.text).toBe('Hello from OpenAI');
    expect(requests.map((headers) => headers.authorization)).toEqual(['Bearer sk-work-1234567890', 'Bearer sk-personal-0987654321']);
  });

  it('embeds through OpenAI with the key stored for it', async () => {
    const { baseURL, requests, bodies } = await provider({
      object: 'list', model: 'text-embedding-3-small',
      data: [{ object: 'embedding', index: 0, embedding: [0.25, 0.5] }],
      usage: { prompt_tokens: 1, total_tokens: 1 },
    });
    vi.stubEnv('OPENAI_BASE_URL', baseURL);
    secrets.set('openai', 'stored-openai-key');

    const { embedding } = await inference.embed({ model: 'openai:text-embedding-3-small', value: 'milk' });

    expect(embedding).toEqual([0.25, 0.5]);
    expect(requests.map((headers) => headers.authorization)).toEqual(['Bearer stored-openai-key']);
    expect(bodies[0]).toMatchObject({ model: 'text-embedding-3-small', input: ['milk'] });
  });

  it('generates images through OpenAI', async () => {
    const png = Buffer.from('fake-png').toString('base64');
    const { baseURL, requests, bodies, paths } = await provider({ created: 0, data: [{ b64_json: png }] });
    vi.stubEnv('OPENAI_BASE_URL', baseURL);
    secrets.set('openai', 'stored-openai-key');

    const { image } = await inference.generateImage({ model: 'openai:gpt-image-1', prompt: 'A carton of milk' });

    expect(image.base64).toBe(png);
    expect(paths).toEqual(['/v1/images/generations']);
    expect(requests.map((headers) => headers.authorization)).toEqual(['Bearer stored-openai-key']);
    expect(bodies[0]).toMatchObject({ model: 'gpt-image-1', prompt: 'A carton of milk', n: 1 });
  });

  it('generates speech through OpenAI', async () => {
    const audio = Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 0, 0]);
    const { baseURL, bodies, paths } = await provider(audio);
    vi.stubEnv('OPENAI_BASE_URL', baseURL);
    secrets.set('openai', 'stored-openai-key');

    const result = await inference.generateSpeech({ model: 'openai:tts-1', text: 'Buy milk', voice: 'alloy' });

    expect([...result.audio.uint8Array]).toEqual([...audio]);
    expect(paths).toEqual(['/v1/audio/speech']);
    expect(bodies[0]).toMatchObject({ model: 'tts-1', input: 'Buy milk', voice: 'alloy' });
  });

  it('transcribes through OpenAI', async () => {
    const { baseURL, requests, bodies, paths } = await provider({ text: 'Buy milk' });
    vi.stubEnv('OPENAI_BASE_URL', baseURL);
    secrets.set('openai', 'stored-openai-key');

    const { text } = await inference.transcribe({ model: 'openai:whisper-1', audio: Uint8Array.from([0xff, 0xfb, 0x90, 0x64]) });

    expect(text).toBe('Buy milk');
    expect(paths).toEqual(['/v1/audio/transcriptions']);
    expect(requests[0]['content-type']).toContain('multipart/form-data');
    expect(bodies[0].text).toContain('whisper-1');
  });

  it("runs an agent with the key stored when it's called, not when it was created", async () => {
    const { baseURL, requests } = await provider(openaiReply('Hello from the agent'));
    vi.stubEnv('OPENAI_BASE_URL', baseURL);
    const agent = await inference.createAgent({ model: 'openai:gpt-5', instructions: 'Be brief' });
    secrets.set('openai', 'key-stored-later');

    const result = await agent.generate({ prompt: 'hi' });

    expect(result.text).toBe('Hello from the agent');
    expect(requests.map((headers) => headers.authorization)).toEqual(['Bearer key-stored-later']);
  });

  it('runs a step on the model prepareStep names by id, with its key', async () => {
    const { baseURL, bodies } = await provider(openaiReply('Hello'));
    vi.stubEnv('OPENAI_BASE_URL', baseURL);
    secrets.set('openai', 'stored-openai-key');

    await inference.generateText({ model: 'openai:gpt-5', prompt: 'hi', prepareStep: () => ({ model: 'openai:gpt-5-mini' }) });

    expect(bodies.map((body) => body.model)).toEqual(['gpt-5-mini']);
  });

  it('asks the provider for the structured output a spec describes, and parses the reply', async () => {
    const { baseURL, bodies } = await provider(openaiReply('{"result":"bug"}'));
    vi.stubEnv('OPENAI_BASE_URL', baseURL);
    secrets.set('openai', 'stored-key');

    const result = await inference.generateText({ model: 'openai:gpt-5', prompt: 'Label this issue', output: { type: 'choice', options: ['bug', 'feature'], name: 'label' } });

    expect(result.output).toBe('bug');
    expect(bodies[0].text).toMatchObject({ format: { type: 'json_schema', name: 'label', schema: { properties: { result: { enum: ['bug', 'feature'] } } } } });
  });

  it('asks the provider for the plain JSON Schema a stored object spec holds', async () => {
    const { baseURL, bodies } = await provider(openaiReply('{"city":"Paris"}'));
    vi.stubEnv('OPENAI_BASE_URL', baseURL);
    secrets.set('openai', 'stored-key');
    const schema: JSONSchema7 = { type: 'object', properties: { city: { type: 'string' } }, required: ['city'], additionalProperties: false };

    const result = await inference.generateText({ model: 'openai:gpt-5', prompt: 'Where?', output: { type: 'object', schema, name: 'place' } });

    expect(result.output).toEqual({ city: 'Paris' });
    expect(bodies[0].text).toMatchObject({ format: { type: 'json_schema', name: 'place', schema } });
  });
});
