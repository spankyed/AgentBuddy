// The user's API keys: metadata in plain text, values encrypted (AES-256-GCM) with a data key from a vault that's
// reached only when a value is encrypted or decrypted
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSecretsStore, KeyVaultUnavailableError, memoryKeyVault, fileKeyVault, type KeyVault } from '../../src/secrets/index.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function setup(options: { osVault?: KeyVault; useFileVault?: boolean; dir?: string } = {}) {
  const dir = options.dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-store-'));
  dirs.push(dir);
  const osVault = options.osVault ?? memoryKeyVault();
  const filePath = path.join(dir, 'secrets.json');
  const store = createSecretsStore({
    filePath,
    osVault: () => osVault,
    fileVault: () => fileKeyVault(path.join(dir, 'secrets.key')),
    useFileVault: options.useFileVault,
  });
  return { dir, filePath, store, osVault };
}

const unavailableVault = (): KeyVault => {
  const fail = () => { throw new KeyVaultUnavailableError('Secret Service', new Error('no dbus')); };
  return { backend: 'Secret Service', protection: 'os-keystore', get: fail, set: fail, delete: fail };
};

/** An OS vault that fails while `down` is true (a locked keyring, a denied prompt) */
const flakyVault = () => {
  const vault = memoryKeyVault();
  const state = { down: true };
  const guard = <T>(run: () => T) => {
    if (state.down) throw new KeyVaultUnavailableError('Secret Service', new Error('locked'));
    return run();
  };
  return Object.assign(vault, {
    state,
    get: (account: string) => guard(() => vault.keys.get(account)),
    set: (account: string, value: string) => guard(() => { vault.keys.set(account, value); }),
  });
};

describe('secrets store', () => {
  it("stores a value encrypted, and gives the selected key's value back", () => {
    const { store, filePath, osVault } = setup();
    const work = store.add('openai', 'Work', 'sk-work-1234567890');
    store.add('openai', 'Personal', 'sk-personal-0987654321');

    expect(work).toMatchObject({ provider: 'openai', label: 'Work', selected: true });
    expect(store.keyFor('openai')).toBe('sk-work-1234567890');
    const bytes = fs.readFileSync(filePath, 'utf-8');
    expect(bytes).not.toContain('sk-work');
    expect(bytes).not.toContain('sk-personal');
    expect((osVault as ReturnType<typeof memoryKeyVault>).keys.size).toBe(1);
    expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
  });

  it('switches the key a provider uses when another is selected', () => {
    const { store } = setup();
    store.add('openai', 'Work', 'sk-work-1234567890');
    const personal = store.add('openai', 'Personal', 'sk-personal-0987654321');
    store.select(personal.id);
    expect(store.keyFor('openai')).toBe('sk-personal-0987654321');
    expect(store.list().map((secret) => [secret.label, secret.selected])).toEqual([['Work', false], ['Personal', true]]);
  });

  it('lists, selects, renames and deletes without reaching the vault', () => {
    const vault = memoryKeyVault();
    const { store, dir } = setup({ osVault: vault });
    const work = store.add('openai', 'Work', 'sk-work-1234567890');
    const personal = store.add('openai', 'Personal', 'sk-personal-0987654321');

    const get = vi.spyOn(vault, 'get');
    const set = vi.spyOn(vault, 'set');
    // A new process: nothing cached
    const fresh = setup({ osVault: vault, dir }).store;
    fresh.list();
    fresh.select(personal.id);
    fresh.rename(work.id, 'Old work');
    fresh.delete(work.id);
    fresh.status();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();

    expect(fresh.keyFor('openai')).toBe('sk-personal-0987654321');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("reads keys after the data folder moves: the vault account is named by the file's key id", () => {
    const vault = memoryKeyVault();
    const { store, dir } = setup({ osVault: vault });
    store.add('anthropic', 'Work', 'sk-ant-work-1234567890');
    const moved = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-moved-'));
    fs.cpSync(dir, moved, { recursive: true });
    expect(setup({ osVault: vault, dir: moved }).store.keyFor('anthropic')).toBe('sk-ant-work-1234567890');
  });

  it("says a key can't be read when its bytes were changed, or it was moved to another record, and still reads the others", () => {
    const { store, filePath } = setup();
    store.add('openai', 'Work', 'sk-work-1234567890');
    store.add('anthropic', 'Work', 'sk-ant-work-1234567890');
    const file = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const data = Buffer.from(file.secrets[0].value.data, 'base64');
    data[0] ^= 0xff;
    file.secrets[0].value.data = data.toString('base64');
    fs.writeFileSync(filePath, JSON.stringify(file));

    expect(() => store.keyFor('openai')).toThrow('The OpenAI key "Work" can\'t be read on this machine: enter it again in Settings → Secrets');
    expect(store.keyFor('anthropic')).toBe('sk-ant-work-1234567890');

    // A value copied onto another record doesn't decrypt there (bound to its id and provider)
    const swapped = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    swapped.secrets[0].value = swapped.secrets[1].value;
    fs.writeFileSync(filePath, JSON.stringify(swapped));
    expect(() => store.keyFor('openai')).toThrow("can't be read on this machine");
  });

  it("says keys can't be read when the vault lost the data key, and stores new ones under a new key", () => {
    const vault = memoryKeyVault();
    const { store, dir } = setup({ osVault: vault });
    store.add('openai', 'Work', 'sk-work-1234567890');
    vault.keys.clear();
    const fresh = setup({ osVault: vault, dir }).store;

    expect(() => fresh.keyFor('openai')).toThrow('The OpenAI key "Work" can\'t be read on this machine');
    fresh.add('anthropic', 'Work', 'sk-ant-work-1234567890');
    expect(fresh.keyFor('anthropic')).toBe('sk-ant-work-1234567890');
    const [work] = fresh.list();
    fresh.replaceValue(work.id, 'sk-work-again-1234567890');
    expect(fresh.keyFor('openai')).toBe('sk-work-again-1234567890');
  });

  it('names the fix when a provider has no key, or none selected', () => {
    const { store } = setup();
    expect(() => store.keyFor('openai')).toThrow('No OpenAI key: add one in Settings → Secrets');
    const work = store.add('openai', 'Work', 'sk-work-1234567890');
    store.add('openai', 'Personal', 'sk-personal-0987654321');
    store.delete(work.id);
    expect(() => store.keyFor('openai')).toThrow('No OpenAI key selected (Personal): choose one in Settings → Secrets');
  });

  it('keeps the previous file when a write stopped before its rename, and replaces the leftover next time', () => {
    const { store, filePath } = setup();
    store.add('openai', 'Work', 'sk-work-1234567890');
    // What a crash between writing the temporary file and renaming it leaves behind
    fs.writeFileSync(`${filePath}.tmp`, '{"format": 1, "secrets": [tru');
    expect(store.list().map((secret) => secret.label)).toEqual(['Work']);
    store.add('openai', 'Personal', 'sk-personal-0987654321');
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    expect(store.list().map((secret) => secret.label)).toEqual(['Work', 'Personal']);
  });

  it('tells listeners the OS has no credential store when adding a key fails, and stores keys once the user allows unprotected storage', () => {
    const { store, dir, filePath } = setup({ osVault: unavailableVault() });
    expect(store.status()).toEqual({ protection: 'os-keystore', backend: 'Secret Service' });
    const heard: string[] = [];
    store.onChange(() => heard.push(store.status().protection));

    expect(() => store.add('openai', 'Work', 'sk-work-1234567890')).toThrow("Secret Service isn't available on this system");
    expect(heard).toEqual(['unavailable']);
    expect(store.list()).toEqual([]);

    store.allowUnprotected();
    store.add('openai', 'Work', 'sk-work-1234567890');
    expect(heard).toEqual(['unavailable', 'unprotected', 'unprotected']);
    expect(store.status()).toEqual({ protection: 'unprotected', backend: 'a file on this system' });
    expect(store.keyFor('openai')).toBe('sk-work-1234567890');
    expect(fs.readFileSync(filePath, 'utf-8')).not.toContain('sk-work');
    expect(fs.statSync(path.join(dir, 'secrets.key')).mode & 0o777).toBe(0o600);
  });

  it('uses the OS credential store again once it works after a failure', () => {
    const vault = flakyVault();
    const { store } = setup({ osVault: vault });
    const heard: string[] = [];
    store.onChange(() => heard.push(store.status().protection));

    expect(() => store.add('openai', 'Work', 'sk-work-1234567890')).toThrow('locked');
    expect(store.status().protection).toBe('unavailable');

    vault.state.down = false;
    store.add('openai', 'Work', 'sk-work-1234567890');
    expect(store.status()).toEqual({ protection: 'os-keystore', backend: 'memory' });
    expect(heard).toEqual(['unavailable', 'os-keystore', 'os-keystore']);
    expect(store.keyFor('openai')).toBe('sk-work-1234567890');
  });

  it('tells listeners of every change to the stored keys, until they stop listening', () => {
    const { store } = setup();
    let calls = 0;
    const stop = store.onChange(() => { calls += 1; });
    const work = store.add('openai', 'Work', 'sk-work-1234567890');
    store.rename(work.id, 'Old work');
    store.replaceValue(work.id, 'sk-work-again-1234567890');
    store.select(work.id);
    store.delete(work.id);
    expect(calls).toBe(5);
    stop();
    store.add('openai', 'Work', 'sk-work-1234567890');
    expect(calls).toBe(5);
  });

  it("removes a data key it just created from the vault when the file can't be written", () => {
    const vault = memoryKeyVault();
    const { store, filePath } = setup({ osVault: vault });
    // A directory where the file's temporary copy goes makes the write fail
    fs.mkdirSync(`${filePath}.tmp`);
    expect(() => store.add('openai', 'Work', 'sk-work-1234567890')).toThrow();
    expect(vault.keys.size).toBe(0);

    fs.rmdirSync(`${filePath}.tmp`);
    store.add('openai', 'Work', 'sk-work-1234567890');
    expect(vault.keys.size).toBe(1);
    expect(store.keyFor('openai')).toBe('sk-work-1234567890');
  });

  it('moves readable keys to a file key when the user allows unprotected storage', () => {
    const vault = memoryKeyVault();
    const { store } = setup({ osVault: vault });
    store.add('openai', 'Work', 'sk-work-1234567890');
    store.allowUnprotected();
    expect(vault.keys.size).toBe(0);
    expect(store.keyFor('openai')).toBe('sk-work-1234567890');
  });

  it('uses the file vault when told to, and never the OS one', () => {
    const vault = memoryKeyVault();
    const get = vi.spyOn(vault, 'get');
    const { store } = setup({ osVault: vault, useFileVault: true });
    store.add('openai', 'Work', 'sk-work-1234567890');
    expect(store.keyFor('openai')).toBe('sk-work-1234567890');
    expect(get).not.toHaveBeenCalled();
    expect(store.status().protection).toBe('unprotected');
  });

  it('deletes every key on clear, with the data key in the vault', () => {
    const vault = memoryKeyVault();
    const { store, filePath } = setup({ osVault: vault });
    store.add('openai', 'Work', 'sk-work-1234567890');
    let calls = 0;
    store.onChange(() => { calls += 1; });
    store.clearAll();
    expect(fs.existsSync(filePath)).toBe(false);
    expect(store.list()).toEqual([]);
    expect(vault.keys.size).toBe(0);
    expect(calls).toBe(1);

    store.add('openai', 'Work', 'sk-work-1234567890');
    expect(vault.keys.size).toBe(1);
    expect(store.keyFor('openai')).toBe('sk-work-1234567890');
  });

  it('deletes the file vault data key on clear, where keys are unprotected', () => {
    const { store, dir } = setup({ useFileVault: true });
    store.add('openai', 'Work', 'sk-work-1234567890');
    store.clearAll();
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'secrets.key'), 'utf-8'))).toEqual({});
  });

  it('rejects a value whose authentication tag has another length', () => {
    const { store, filePath } = setup();
    store.add('openai', 'Work', 'sk-work-1234567890');
    const file = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    file.secrets[0].value.tag = Buffer.from(file.secrets[0].value.tag, 'base64').subarray(0, 12).toString('base64');
    fs.writeFileSync(filePath, JSON.stringify(file));
    expect(() => store.keyFor('openai')).toThrow("can't be read on this machine");
  });

  it('rejects a file in a format it does not know', () => {
    const { store, filePath } = setup();
    fs.writeFileSync(filePath, JSON.stringify({ format: 99, secrets: [] }));
    expect(() => store.list()).toThrow(`Unknown stored keys format 99 in ${filePath}`);
  });
});
