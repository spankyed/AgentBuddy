// Where the data key that encrypts the stored secrets lives: the OS credential store, or a file the user chose.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { writePrivateFile } from '../private-file.ts';
import { errorMessage } from '@abuddy/sdk/utils/pure';

/** Holds data keys by account name */
export interface KeyVault {
  /** Names the store for the user, e.g. "macOS Keychain" */
  readonly backend: string;
  readonly protection: 'os-keystore' | 'unprotected';
  get(account: string): string | undefined;
  set(account: string, value: string): void;
  delete(account: string): void;
}

/**
 * The account a store's data key is under, and the file an unprotected one keeps it in. Both are facts about
 * a store on disk rather than about either vault, so anything reading a store that this process did not
 * create — `abuddy run --with-secrets`, copying an environment's secrets into an instance — addresses it
 * through these rather than spelling the convention again.
 *
 * The third such fact is the credential store's service name, which is the app name: a caller for another
 * environment takes it from `resolveAppContext({ build: env }).appName`, the same accessor `appStore` reads.
 */
export const dataKeyAccount = (keyId: string): string => `secrets:${keyId}`;

export const dataKeyFile = (secretsFile: string): string => path.join(path.dirname(secretsFile), 'secrets.key');

/** The OS credential store can't be used on this system (no Secret Service, a keyring that refuses) */
export class KeyVaultUnavailableError extends Error {
  constructor(backend: string, cause: unknown) {
    super(`${backend} isn't available on this system: ${errorMessage(cause)}`, { cause });
    this.name = 'KeyVaultUnavailableError';
  }
}

type KeyringEntry = { getPassword(): string | null; setPassword(password: string): void; deleteCredential(): boolean };
type Keyring = { Entry: new (service: string, account: string) => KeyringEntry };

const OS_BACKENDS: Partial<Record<NodeJS.Platform, string>> = { darwin: 'macOS Keychain', win32: 'Windows Credential Manager' };

/** The OS credential store (`@napi-rs/keyring`), loaded on first use; `service` names the app */
export function osKeyVault(service: string): KeyVault {
  const backend = OS_BACKENDS[process.platform] ?? 'Secret Service';
  let keyring: Keyring | undefined;
  const entry = (account: string): KeyringEntry => {
    try {
      keyring ??= createRequire(import.meta.url)('@napi-rs/keyring') as Keyring;
      return new keyring.Entry(service, account);
    } catch (error) {
      throw new KeyVaultUnavailableError(backend, error);
    }
  };
  const call = <T>(run: () => T): T => {
    try {
      return run();
    } catch (error) {
      throw new KeyVaultUnavailableError(backend, error);
    }
  };
  return {
    backend,
    protection: 'os-keystore',
    get: (account) => call(() => entry(account).getPassword() ?? undefined),
    set: (account, value) => call(() => entry(account).setPassword(value)),
    delete: (account) => { call(() => entry(account).deleteCredential()); },
  };
}

/** Data keys in a file only the user can read, next to the stored keys: no protection beyond file permissions */
export function fileKeyVault(file: string): KeyVault {
  const read = (): Record<string, string> => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
  const write = (keys: Record<string, string>) => writePrivateFile(file, JSON.stringify(keys));
  return {
    backend: 'a file on this system',
    protection: 'unprotected',
    get: (account) => read()[account],
    set: (account, value) => write({ ...read(), [account]: value }),
    delete: (account) => {
      const { [account]: _removed, ...rest } = read();
      write(rest);
    },
  };
}

/** Data keys in memory, for tests */
export function memoryKeyVault(protection: KeyVault['protection'] = 'os-keystore'): KeyVault & { keys: Map<string, string> } {
  const keys = new Map<string, string>();
  return {
    keys,
    backend: 'memory',
    protection,
    get: (account) => keys.get(account),
    set: (account, value) => { keys.set(account, value); },
    delete: (account) => { keys.delete(account); },
  };
}
