// The app's services.inference: `provider:model` ids resolve to that provider's AI SDK model, built with
// the key the user stored for the provider. Local HTTP servers stand in for the providers.
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { availableModels, parseModelId, providerCapabilities, providerLabels, type ModelKind } from '@abuddy/sdk/models';

const secrets = new Map<string, string>();
vi.mock('../../src/settings/index.ts', () => ({
  settingsRepository: {
    settingsQueries: { getGeneralSettings: () => ({ secrets: Object.fromEntries([...secrets.keys()].map((provider) => [provider, `secret-${provider}`])) }) },
    secretsQueries: { getSecret: (id: string) => ({ encryptedValue: secrets.get(id.replace('secret-', '')) }) },
  },
}));

const { inference, model: resolveModel } = await import('../../src/services/inference.ts');
const languageModel = (id: string) => resolveModel('language', id as never);

const PROVIDERS = Object.keys(providerLabels);

let server: http.Server | undefined;
beforeEach(() => {
  secrets.clear();
  // No test reaches a provider with a real key, whatever the environment holds
  for (const provider of PROVIDERS) vi.stubEnv(`${provider.toUpperCase()}_API_KEY`, '');
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

/** A local server answering every request with `body`, recording each request's headers and JSON body */
async function provider(body: object): Promise<{ baseURL: string; requests: http.IncomingHttpHeaders[]; bodies: Array<Record<string, unknown>> }> {
  const requests: http.IncomingHttpHeaders[] = [];
  const bodies: Array<Record<string, unknown>> = [];
  server = http.createServer((req, res) => {
    let received = '';
    req.on('data', (chunk) => { received += chunk; });
    req.on('end', () => {
      requests.push(req.headers);
      bodies.push(JSON.parse(received));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return { baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, requests, bodies };
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
    const kinds: ModelKind[] = ['language', 'embedding', 'image', 'speech', 'transcription'];
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

  it("names the provider and where to add a key when the user hasn't stored one", async () => {
    await expect(languageModel('anthropic:claude-sonnet-4-5')).rejects.toThrow('No API key for anthropic: add one in Settings → Secrets, or set ANTHROPIC_API_KEY');
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

  it('calls OpenAI with the environment key when none is stored', async () => {
    const { baseURL, requests } = await provider(openaiReply('Hello from OpenAI'));
    vi.stubEnv('OPENAI_BASE_URL', baseURL);
    vi.stubEnv('OPENAI_API_KEY', 'env-openai-key');

    const result = await inference.generateText({ model: 'openai:gpt-5', prompt: 'hi' });

    expect(result.text).toBe('Hello from OpenAI');
    expect(requests.map((headers) => headers.authorization)).toEqual(['Bearer env-openai-key']);
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

  it('asks the provider for the structured output a spec describes, and parses the reply', async () => {
    const { baseURL, bodies } = await provider(openaiReply('{"result":"bug"}'));
    vi.stubEnv('OPENAI_BASE_URL', baseURL);
    secrets.set('openai', 'stored-key');

    const result = await inference.generateText({ model: 'openai:gpt-5', prompt: 'Label this issue', output: { type: 'choice', options: ['bug', 'feature'], name: 'label' } });

    expect(result.output).toBe('bug');
    expect(bodies[0].text).toMatchObject({ format: { type: 'json_schema', name: 'label', schema: { properties: { result: { enum: ['bug', 'feature'] } } } } });
  });
});
