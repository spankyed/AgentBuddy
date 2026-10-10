import { describe, expect, it } from 'vitest';
import { APP_ENVS } from '@abuddy/sdk/env';
import { _useFileVault } from '../../src/secrets/index.ts';

/**
 * Where the data key lives. This is the one decision in the secrets path that can lose a user access to
 * keys they already have: the key is either in the OS credential store under the app's name, or in a file
 * beside `secrets.json` in the data dir, and looking in the wrong one reads as "the app lost my keys".
 *
 * `abuddy dev --profile` needs the file, because the keychain is keyed by app name and every profile of
 * one channel would otherwise share a service. So the rule is gated on a variable the CLI sets, never on
 * the environment alone.
 */
describe('choosing the key vault', () => {
  it('keeps the credential store for an app nobody asked to isolate', () => {
    for (const env of APP_ENVS.filter(e => e !== 'test')) {
      expect(_useFileVault(env, undefined), `${env} with no request`).toBe(false);
    }
  });

  // The case that matters: a Beta launched from Finder inherits no shell environment, so it must keep
  // reading the keychain. Deciding this on `env` instead would empty every existing Beta user's keys.
  it('keeps it for a beta launched normally', () => {
    expect(_useFileVault('beta', undefined)).toBe(false);
  });

  it('uses a file when an instance asks for one, in development and beta alike', () => {
    expect(_useFileVault('development', 'file')).toBe(true);
    expect(_useFileVault('beta', 'file')).toBe(true);
  });

  it('never lets production opt out, however it is asked', () => {
    for (const requested of ['file', 'FILE', 'yes', '1', '']) {
      expect(_useFileVault('production', requested), requested).toBe(false);
    }
  });

  it('always uses a file under test, asked or not', () => {
    expect(_useFileVault('test', undefined)).toBe(true);
    expect(_useFileVault('test', 'file')).toBe(true);
  });

  it('takes only the exact value, so a stray variable does not move anyone\'s keys', () => {
    for (const requested of ['File', 'file ', 'true', 'os']) {
      expect(_useFileVault('development', requested), requested).toBe(false);
    }
  });
});
