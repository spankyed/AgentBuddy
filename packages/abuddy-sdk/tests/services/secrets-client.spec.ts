// secretsClient calls the frontend host's `secrets-client` module and nothing else of the API client
import { describe, expect, it } from 'vitest';
import { secretsClient, type SecretsClient } from '../../src/fe/secrets-client.ts';
import { registerHostModule } from '../../src/runtime/host.ts';

describe('secretsClient', () => {
  it("passes each call to the host's secrets-client module, resolving with its snapshot", async () => {
    const snapshot = { secrets: [], status: { protection: 'os-keystore' as const, backend: 'test' } };
    const calls: unknown[][] = [];
    const record = (name: string) => async (...args: unknown[]) => { calls.push([name, ...args]); return snapshot; };
    const host: SecretsClient = {
      list: record('list'), add: record('add'), replaceValue: record('replaceValue'), select: record('select'),
      rename: record('rename'), delete: record('delete'), allowUnprotected: record('allowUnprotected'),
    };
    registerHostModule('secrets-client', host);

    await expect(secretsClient.add('openai', 'Work', 'sk-value')).resolves.toBe(snapshot);
    await secretsClient.list();
    await secretsClient.replaceValue('s1', 'sk-new');
    await secretsClient.select('s1');
    await secretsClient.rename('s1', 'Home');
    await secretsClient.delete('s1');
    await secretsClient.allowUnprotected();

    expect(calls).toEqual([
      ['add', 'openai', 'Work', 'sk-value'], ['list'], ['replaceValue', 's1', 'sk-new'], ['select', 's1'],
      ['rename', 's1', 'Home'], ['delete', 's1'], ['allowUnprotected'],
    ]);
  });
});
