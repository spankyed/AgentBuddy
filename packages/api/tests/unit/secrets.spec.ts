// API keys in the API: the secrets procedures (the only way a value reaches the backend), logs and error reports
// that redact keys, and keys moved out of the old plain-text secrets directory.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The host init opens the app's stores: point them at a throwaway data dir (the test environment keeps keys' data key in a file)
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-secrets-'));
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-secrets-logs-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
process.env.AGENTBUDDY_LOG_DIR = logDir;
await import('@/setup/sdk-host-init');
const { secretsRouter } = await import('@/core/router/secrets-router');
const { rootEvents } = await import('@/core/router/bus-emitter');
const { createLogger } = await import('@/core/shared/debug/logger');
const { originalConsole } = await import('@/core/shared/debug/log-capture');
const { reportSystemError } = await import('@/core/shared/system-errors');
const { migrateLegacySecrets, readLegacySecrets } = await import('@/core/persistence/legacy-secrets');
const { openEnvAt } = await import('@/core/persistence/lmdb/envs');
const { makeLmdbAdapter } = await import('@/core/persistence/lmdb/adapter');
const { secretsStore, createSecretsStore, memoryKeyVault, KeyVaultUnavailableError } = await import('@abuddy/host/secrets');
const { services } = await import('@abuddy/sdk/services');
const { registerDesignations } = await import('@abuddy/sdk/designations');

const KEY = 'sk-proj-SPECKEY1234567890abcdefghij';
const caller = secretsRouter.createCaller({});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(logDir, { recursive: true, force: true });
});
beforeEach(() => secretsStore.clearAll());

describe('secrets procedures', () => {
  it('add, select, rename and delete keys, return no values, and tell the settings system without one', async () => {
    registerDesignations({ settings: 'test.settings' });
    const incoming: Array<Record<string, unknown>> = [];
    const stop = rootEvents.onIncoming((event) => { incoming.push(event); });

    const added = await caller.add({ provider: 'openai', label: 'Work', value: KEY });
    const personal = (await caller.add({ provider: 'openai', label: 'Personal', value: 'sk-personal-1234567890abcdef' })).secrets[1];
    await caller.select({ id: personal.id });
    await caller.rename({ id: added.secrets[0].id, label: 'Old work' });
    const listed = await caller.list();
    stop();

    expect(listed.secrets.map((secret) => [secret.label, secret.selected])).toEqual([['Old work', false], ['Personal', true]]);
    expect(listed.status).toEqual({ protection: 'unprotected', backend: 'a file on this system' });
    expect(secretsStore.keyFor('openai')).toBe('sk-personal-1234567890abcdef');
    expect(JSON.stringify([added, listed])).not.toContain('sk-');
    expect(incoming).toEqual(Array(4).fill({ type: 'SECRETS_CHANGED', systemId: 'test.settings' }));

    await caller.delete({ id: personal.id });
    expect(() => secretsStore.keyFor('openai')).toThrow('No OpenAI key selected (Old work)');
  });

  it('rejects input that names no provider or carries no value', async () => {
    await expect(caller.add({ provider: 'nope' as never, label: 'Work', value: KEY })).rejects.toThrow();
    await expect(caller.add({ provider: 'openai', label: 'Work', value: '' })).rejects.toThrow();
  });

  it('services.secrets gives packs the metadata, without values', async () => {
    await caller.add({ provider: 'anthropic', label: 'Work', value: 'sk-ant-api03-1234567890abcdef' });
    expect(services.secrets.list()).toEqual([expect.objectContaining({ provider: 'anthropic', label: 'Work', selected: true })]);
    expect(JSON.stringify(services.secrets.list())).not.toContain('sk-ant');
    expect('value' in services.secrets.list()[0]).toBe(false);
  });

  it('services.appData.reset deletes stored keys', async () => {
    await caller.add({ provider: 'openai', label: 'Work', value: KEY });
    await services.appData.reset();
    expect(services.secrets.list()).toEqual([]);
  });
});

describe('logs and error reports', () => {
  it('redact key-shaped strings and credential fields in every sink', () => {
    const logged: Array<Record<string, unknown>> = [];
    const stop = rootEvents.onLog((event) => { logged.push(event as never); });
    const console = vi.spyOn(originalConsole, 'error').mockImplementation(() => {});

    createLogger('spec').error(`Provider said: Incorrect API key provided: ${KEY}`, {
      event: { type: 'UPDATE', value: { apiKey: 'plain-credential', note: `pasted ${KEY}` } },
      error: new Error(`401 for ${KEY}`),
    });
    stop();
    const printed = JSON.stringify(console.mock.calls);
    console.mockRestore();

    const file = fs.readFileSync(path.join(logDir, 'app-events.log'), 'utf-8');
    for (const sink of [JSON.stringify(logged), printed, file]) {
      expect(sink).not.toContain('SPECKEY');
      expect(sink).not.toContain('plain-credential');
      expect(sink).toContain('[redacted]');
    }
  });

  it('redact keys from system error reports', () => {
    const outgoing: Array<Record<string, unknown>> = [];
    const stop = rootEvents.onOutgoing((event) => { outgoing.push(event); });
    reportSystemError({ error: new Error(`Incorrect API key provided: ${KEY}`), source: 'spec' });
    stop();
    expect(JSON.stringify(outgoing)).not.toContain('SPECKEY');
    expect(JSON.stringify(outgoing)).toContain('[redacted]');
  });
});

describe('keys from the old plain-text secrets directory', () => {
  /** An old secrets directory with Secret rows as the EARS LMDB adapter wrote them */
  function legacyDir(rows: Array<{ id: string; attrs: Record<string, unknown> }>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-secrets-'));
    const dbs = openEnvAt(dir);
    const adapter = makeLmdbAdapter(dbs);
    for (const { id, attrs } of rows) {
      adapter.onCreateEntity(id, 'Secret');
      for (const [kind, value] of Object.entries(attrs)) adapter.onPutAttr(kind, id, 0, value, [value]);
    }
    adapter.close?.();
    dbs.root.close();
    return dir;
  }

  const rows = [
    { id: 'Secret-old1', attrs: { provider: 'openai', encryptedValue: 'sk-old-openai-1234567890', createdAt: 10, updatedAt: 20 } },
    { id: 'Secret-old2', attrs: { provider: 'anthropic', encryptedValue: 'sk-ant-old-1234567890', createdAt: 11 } },
    { id: 'Secret-old3', attrs: { provider: 'custom', customName: 'GitHub', encryptedValue: 'ghp_old_1234567890', createdAt: 12 } },
  ];

  it('imports them with their ids, labels and selection, then deletes the directory; a second run changes nothing', () => {
    const dir = legacyDir(rows);
    expect(readLegacySecrets(dir).map((secret) => [secret.id, secret.label])).toEqual([['Secret-old1', 'OpenAI'], ['Secret-old2', 'Anthropic'], ['Secret-old3', 'GitHub']]);

    expect(migrateLegacySecrets(dir)).toBe('imported');
    expect(fs.existsSync(dir)).toBe(false);
    expect(secretsStore.list()).toEqual([
      { id: 'Secret-old1', provider: 'openai', label: 'OpenAI', selected: true, createdAt: 10, updatedAt: 20 },
      { id: 'Secret-old2', provider: 'anthropic', label: 'Anthropic', selected: true, createdAt: 11 },
      { id: 'Secret-old3', provider: 'custom', label: 'GitHub', selected: true, createdAt: 12 },
    ]);
    expect(secretsStore.keyFor('openai')).toBe('sk-old-openai-1234567890');
    expect(migrateLegacySecrets(dir)).toBe('none');
  });

  it('keeps the directory while there is nowhere to store keys, and imports it later', () => {
    const dir = legacyDir(rows.slice(0, 1));
    const unavailable = { backend: 'Secret Service', protection: 'os-keystore' as const, get: () => { throw new KeyVaultUnavailableError('Secret Service', 'no dbus'); }, set: () => { throw new KeyVaultUnavailableError('Secret Service', 'no dbus'); }, delete: () => {} };
    const store = createSecretsStore({ filePath: path.join(dir, '..', `${path.basename(dir)}.json`), osVault: () => unavailable, fileVault: () => memoryKeyVault('unprotected') });

    expect(migrateLegacySecrets(dir, store)).toBe('deferred');
    expect(fs.existsSync(dir)).toBe(true);
    store.allowUnprotected();
    expect(migrateLegacySecrets(dir, store)).toBe('imported');
    expect(store.keyFor('openai')).toBe('sk-old-openai-1234567890');
  });

  it("keeps the directory when an imported key doesn't read back", () => {
    const dir = legacyDir(rows.slice(0, 1));
    const store = { ...secretsStore, canRead: () => false };
    expect(() => migrateLegacySecrets(dir, store)).toThrow(`Imported API keys don't read back (Secret-old1); ${dir} was kept`);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('reads Secret rows as the app stored them through EARS', async () => {
    const { tx } = await import('@abuddy/sdk/ears');
    const { closePersistence, reinitializeLmdb, clearMemory } = await import('@abuddy/host/ears');
    const { getSecretsLmdbPath } = await import('@abuddy/sdk/utils');
    const id = tx('Secret' as never).batchPut({ provider: 'mistral', encryptedValue: 'mistral-old-key-1234567890', customName: 'Team', createdAt: 5 } as never).id();
    closePersistence();
    try {
      expect(readLegacySecrets(getSecretsLmdbPath())).toEqual([{ id, provider: 'mistral', label: 'Team', value: 'mistral-old-key-1234567890', createdAt: 5 }]);
    } finally {
      clearMemory();
      reinitializeLmdb();
    }
  });

  it('deletes an old directory with no keys in it', () => {
    const dir = legacyDir([]);
    expect(migrateLegacySecrets(dir)).toBe('none');
    expect(fs.existsSync(dir)).toBe(false);
  });
});
