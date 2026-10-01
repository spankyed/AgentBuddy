/**
 * `--with-secrets`: give a new instance a copy of the secrets the shared data dir already holds.
 *
 * An instance starts with none, which is what makes it self-contained — its data, packs, logs and secrets
 * are all inside it, so `rm -rf` is the whole cleanup. That is the right default and it has one cost: an
 * ephemeral instance cannot call a model, or reach anything else a secret is for, until someone types one
 * into Settings — every single run.
 *
 * **Secrets, not keys.** The store was always meant to hold any secret a user has; that it holds only model
 * API keys today, keyed by `SecretProvider`, is an early prototype requirement rather than the design. So
 * nothing here narrows its vocabulary to "keys" — a reader who adds the next class of secret should find
 * no wording telling them this was for API keys.
 *
 * Two neighbours it is worth not confusing with: the **data key** below, which is the one key in play here
 * and encrypts the rest, and the app server's API token (`ABUDDY_API_TOKEN`, the `api-token` file), which
 * is transport auth and never goes in this store.
 *
 * This is the opt-out, and it keeps the property that mattered. The keys land in the instance's own file
 * vault rather than the OS keychain, so removing the directory still removes them; nothing is written to
 * the keychain, and nothing outside the instance is touched. What it costs is that the copy is protected by
 * file permissions alone (0600) rather than by the credential store — the same trade every instance already
 * makes, which the app states in Settings as "a key kept in a file on this system".
 *
 * **It copies the data key rather than re-encrypting.** The credential store never holds a secret itself —
 * it holds one data key, at `secrets:<keyId>`, and `secrets.json` holds every value encrypted under it. So
 * carrying that one key across makes the copied file readable as it stands, where decrypting and
 * re-encrypting would put every plaintext value through this process for no gain.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { appDataDirFor, resolveAppContext, type AppEnv } from '@abuddy/sdk/env';
import { _appDataPaths } from '@abuddy/sdk/utils';
import { dataKeyAccount, dataKeyFile, fileKeyVault, osKeyVault, type KeyVault } from '@abuddy/host/secrets';
import type { InstanceKind, OpenedInstance } from './instances.ts';

/** What a secrets file records about itself. Only the fields this needs; the store owns the rest. */
interface SecretsFile {
  protection?: 'os-keystore' | 'unprotected';
  keyId?: string;
  secrets?: unknown[];
}

const packagedLayout = (kind: InstanceKind) => kind === 'packaged';

const readFile = (file: string): SecretsFile | undefined => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as SecretsFile;
  } catch {
    return undefined;
  }
};

/**
 * Where the shared data dir for this environment keeps its secrets. Every *path* here comes from
 * `appDataDirFor` rather than `resolveAppContext().userDataDir`, because that one follows
 * `ABUDDY_USER_DATA_DIR`: the source has to be the environment's own directory, never whatever an enclosing
 * instance pointed this process at.
 */
export function sourceSecretsFile(env: AppEnv, kind: InstanceKind): string {
  return _appDataPaths(appDataDirFor(env), { packaged: packagedLayout(kind) }).secretsFile;
}

/**
 * The vault a secrets file's own `protection` says its data key is in — which is a different question from the
 * one the app answers when it opens a store: the app chooses a vault for one it may be about to create, from
 * the environment and the user's choice, while a tool reading a store that already exists must use whichever
 * one the file records.
 *
 * The credential store's service is the app name, read through `resolveAppContext` — the same accessor the
 * app's own store uses, so the two cannot drift. Only `appName` is taken from that context: its `userDataDir`
 * would follow `ABUDDY_USER_DATA_DIR`, where every path here comes from `appDataDirFor` instead.
 */
function vaultFor(file: SecretsFile, secretsFile: string, env: AppEnv): KeyVault {
  if (file.protection === 'unprotected') return fileKeyVault(dataKeyFile(secretsFile));
  return osKeyVault(resolveAppContext({ env }).appName);
}

export interface SecretCopy {
  /** How many stored keys the instance now has */
  count: number;
  /** Where they came from */
  from: string;
}

/**
 * Copies the environment's stored keys into `instance`, or explains why it cannot.
 *
 * Throws rather than warning: `--with-secrets` was asked for, and a run that silently starts with no keys is
 * the thing this exists to prevent. Reading the source key may prompt for keychain access, which is the
 * credential store doing its job.
 */
export function copySecretsInto(instance: OpenedInstance, kind: InstanceKind, env: AppEnv): SecretCopy {
  const from = sourceSecretsFile(env, kind);
  const source = readFile(from);
  if (!source) throw new Error(`--with-secrets found no keys to copy: ${from} doesn't exist or can't be read.`);

  const count = Array.isArray(source.secrets) ? source.secrets.length : 0;
  if (count === 0) throw new Error(`--with-secrets found no keys to copy: ${from} holds none.`);
  if (!source.keyId) throw new Error(`--with-secrets can't read ${from}: it records no keyId.`);

  const dataKey = vaultFor(source, from, env).get(dataKeyAccount(source.keyId));
  if (dataKey === undefined) {
    throw new Error(
      `--with-secrets could not read the data key for ${from}. Its values stay encrypted without it, so there `
      + 'is nothing useful to copy. Open Settings → Secrets in the app once to re-establish it.',
    );
  }

  const target = _appDataPaths(instance.dir, { packaged: packagedLayout(kind) }).secretsFile;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // `unprotected` because the key now lives beside the file rather than in the credential store, and the
  // app reads this field to tell the user which it is
  fs.writeFileSync(target, JSON.stringify({ ...source, protection: 'unprotected' }, null, 2) + '\n');
  fileKeyVault(dataKeyFile(target)).set(dataKeyAccount(source.keyId), dataKey);

  return { count, from };
}
