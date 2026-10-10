import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _appDataPaths } from '@abuddy/sdk/utils';
import type { OpenedProfile } from '../../src/app/profiles';

/**
 * `--with-secrets` copies the environment's stored keys into a new profile. The property under test is the
 * one that made "start with none" the default in the first place: the copy stays **inside** the profile,
 * so `rm -rf` is still the whole cleanup and the OS keychain gains nothing.
 */
let tmp: string;
let srcDir: string;

// The source is the environment's own data dir, which `appDataDirFor` resolves and which must not follow
// ABUDDY_USER_DATA_DIR. Pointing it at a temp dir is the only way to test without touching real keys.
vi.mock('@abuddy/sdk/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@abuddy/sdk/env')>()),
  appDataDirFor: () => srcDir,
}));

const osEntries: Array<{ service: string; account: string }> = [];
vi.mock('@abuddy/host/secrets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@abuddy/host/secrets')>()),
  // Records every reach for the credential store, so a test can assert it was never written
  osKeyVault: (service: string) => ({
    backend: 'fake', protection: 'os-keystore' as const,
    get: (account: string) => { osEntries.push({ service, account }); return 'the-data-key'; },
    set: (account: string) => { osEntries.push({ service, account }); },
    delete: () => {},
  }),
}));

const profile = (dir: string): OpenedProfile => ({ name: 'probe', dir, ephemeral: false, created: true });
const srcSecrets = () => _appDataPaths(srcDir).secretsFile;

function writeSource(file: Record<string, unknown>, keyFileEntries?: Record<string, string>) {
  const target = srcSecrets();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(file));
  if (keyFileEntries) fs.writeFileSync(path.join(path.dirname(target), 'secrets.key'), JSON.stringify(keyFileEntries));
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-secrets-'));
  srcDir = path.join(tmp, 'shared');
  osEntries.length = 0;
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  vi.resetModules();
});

describe('copying keys into a new profile', () => {
  it('puts the keys and their data key inside the profile, and nothing in the keychain', async () => {
    const { copySecretsInto } = await import('../../src/app/profile-secrets.ts');
    writeSource({ format: 1, protection: 'os-keystore', keyId: 'k_1', secrets: [{ provider: 'anthropic' }, { provider: 'openai' }] });
    const dir = path.join(tmp, 'inst');
    fs.mkdirSync(dir);

    const result = copySecretsInto(profile(dir), 'development');

    expect(result.count).toBe(2);
    const copied = _appDataPaths(dir).secretsFile;
    expect(fs.existsSync(copied), 'the keys are in the profile').toBe(true);
    const keyFile = path.join(path.dirname(copied), 'secrets.key');
    expect(JSON.parse(fs.readFileSync(keyFile, 'utf-8')), 'and so is the data key that decrypts them')
      .toEqual({ 'secrets:k_1': 'the-data-key' });
    // One reach, to read the source key, under the environment's real app name — the service the app's own
    // store uses. `appDataDirFor` is mocked to a temp dir here, so an assertion that still names
    // `abuddy-dev` is what shows the service comes from the app name and not from that directory.
    expect(osEntries).toEqual([{ service: 'abuddy-dev', account: 'secrets:k_1' }]);
  });

  // The field the app reads to tell the user which protection is in force. A copy sits in a file, and
  // Settings says so — claiming os-keystore here would be a lie the UI repeats.
  it('records the copy as unprotected, because the key now sits beside it', async () => {
    const { copySecretsInto } = await import('../../src/app/profile-secrets.ts');
    writeSource({ format: 1, protection: 'os-keystore', keyId: 'k_1', secrets: [{ provider: 'anthropic' }] });
    const dir = path.join(tmp, 'inst');
    fs.mkdirSync(dir);

    copySecretsInto(profile(dir), 'development');

    const copied = JSON.parse(fs.readFileSync(_appDataPaths(dir).secretsFile, 'utf-8'));
    expect(copied.protection).toBe('unprotected');
    expect(copied.secrets, 'the encrypted values carry over untouched').toHaveLength(1);
  });

  it('reads a source that already uses a file vault without going near the keychain', async () => {
    const { copySecretsInto } = await import('../../src/app/profile-secrets.ts');
    writeSource({ format: 1, protection: 'unprotected', keyId: 'k_2', secrets: [{ provider: 'groq' }] },
                { 'secrets:k_2': 'file-held-key' });
    const dir = path.join(tmp, 'inst');
    fs.mkdirSync(dir);

    copySecretsInto(profile(dir), 'development');

    expect(osEntries, 'an unprotected source needs no credential store').toEqual([]);
    const keyFile = path.join(path.dirname(_appDataPaths(dir).secretsFile), 'secrets.key');
    expect(JSON.parse(fs.readFileSync(keyFile, 'utf-8'))).toEqual({ 'secrets:k_2': 'file-held-key' });
  });

});

describe('when there is nothing useful to copy', () => {
  // Throwing rather than warning: --with-secrets was asked for, and a run that quietly starts with no keys is
  // the exact situation this flag exists to avoid.
  it('refuses when the environment has no secrets file', async () => {
    const { copySecretsInto } = await import('../../src/app/profile-secrets.ts');
    const dir = path.join(tmp, 'inst');
    fs.mkdirSync(dir);
    expect(() => copySecretsInto(profile(dir), 'development')).toThrow(/no keys to copy/);
  });

  it('refuses an empty store rather than reporting a copy of nothing', async () => {
    const { copySecretsInto } = await import('../../src/app/profile-secrets.ts');
    writeSource({ format: 1, protection: 'os-keystore', keyId: 'k_1', secrets: [] });
    const dir = path.join(tmp, 'inst');
    fs.mkdirSync(dir);
    expect(() => copySecretsInto(profile(dir), 'development')).toThrow(/holds none/);
  });

  it('refuses when the data key cannot be read, since the values stay ciphertext without it', async () => {
    writeSource({ format: 1, protection: 'unprotected', keyId: 'k_9', secrets: [{ p: 1 }] }, {});
    const { copySecretsInto } = await import('../../src/app/profile-secrets.ts');
    const dir = path.join(tmp, 'inst');
    fs.mkdirSync(dir);
    expect(() => copySecretsInto(profile(dir), 'development')).toThrow(/could not read the data key/);
    expect(fs.existsSync(_appDataPaths(dir).secretsFile), 'and writes no half-copy').toBe(false);
  });
});
