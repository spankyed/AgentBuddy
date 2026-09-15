// The user's API keys: metadata in plain text and each value encrypted (AES-256-GCM) in one file, with the data key in
// a KeyVault. Listing, selecting, renaming and deleting never need the data key; the vault is reached the first time a
// value is encrypted or decrypted, and the data key is kept in memory after that. Values are decrypted on each use.
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { secretRules, secretProviderLabel, toSecretInfo, type ProviderName, type SecretInfo, type SecretProvider, type SecretsStatus } from '@abuddy/sdk/services';
import { KeyVaultUnavailableError, type KeyVault } from './vault.ts';

const FORMAT = 1;

interface EncryptedValue { keyId: string; iv: string; tag: string; data: string }
interface StoredSecret extends SecretInfo { value: EncryptedValue }
interface SecretsFile { format: number; protection: 'os-keystore' | 'unprotected'; keyId: string; secrets: StoredSecret[] }

/** A key from an earlier store, imported with its value */
export interface ImportedSecret { id: string; provider: SecretProvider; label: string; value: string; createdAt: number; updatedAt?: number }

export interface SecretsStoreOptions {
  /** The store's file; its directory also holds the file vault's data keys */
  filePath: string;
  osVault: () => KeyVault;
  fileVault: () => KeyVault;
  /** Always use the file vault (the test environment, or a development opt-in) */
  useFileVault?: boolean;
  now?: () => number;
}

export interface SecretsStore {
  status(): SecretsStatus;
  list(): SecretInfo[];
  select(id: string): void;
  rename(id: string, label: string): void;
  delete(id: string): void;
  add(provider: SecretProvider, label: string, value: string): SecretInfo;
  replaceValue(id: string, value: string): void;
  /** The selected key's value for a provider; throws naming the fix when there's none or it can't be read */
  keyFor(provider: ProviderName): string;
  /** Whether a stored key's value decrypts here */
  canRead(id: string): boolean;
  /** Keeps data keys in a file from now on, where the OS has no credential store */
  allowUnprotected(): void;
  /** Adds keys from an earlier store, skipping ids already stored */
  importSecrets(secrets: ImportedSecret[]): void;
  /** Deletes every stored key (the vault's data keys stay, for reuse) */
  clearAll(): void;
}

const newKeyId = () => `k_${crypto.randomBytes(12).toString('base64url')}`;
const account = (keyId: string) => `secrets:${keyId}`;

export function createSecretsStore(options: SecretsStoreOptions): SecretsStore {
  const now = options.now ?? Date.now;
  /** Data keys read or created this process, by key id */
  const dataKeys = new Map<string, Buffer>();
  /** The OS vault failed this process: adding keys waits for the user to allow unprotected storage */
  let osVaultUnavailable = false;

  const read = (): SecretsFile => {
    if (!fs.existsSync(options.filePath)) return { format: FORMAT, protection: 'os-keystore', keyId: newKeyId(), secrets: [] };
    const file = JSON.parse(fs.readFileSync(options.filePath, 'utf-8')) as SecretsFile;
    if (file.format !== FORMAT) throw new Error(`Unknown stored keys format ${file.format} in ${options.filePath}`);
    return file;
  };

  const write = (file: SecretsFile) => {
    fs.mkdirSync(path.dirname(options.filePath), { recursive: true });
    const temporary = `${options.filePath}.tmp`;
    const fd = fs.openSync(temporary, 'w', 0o600);
    try {
      fs.writeSync(fd, JSON.stringify(file, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, options.filePath);
  };

  const vaultFor = (file: SecretsFile): KeyVault =>
    options.useFileVault || file.protection === 'unprotected' ? options.fileVault() : options.osVault();

  /** Runs a vault call, remembering when the OS vault can't be used */
  const withVault = <T>(file: SecretsFile, run: (vault: KeyVault) => T): T => {
    const vault = vaultFor(file);
    try {
      return run(vault);
    } catch (error) {
      if (error instanceof KeyVaultUnavailableError && vault.protection === 'os-keystore') osVaultUnavailable = true;
      throw error;
    }
  };

  const loadKey = (file: SecretsFile, keyId: string): Buffer | undefined => {
    const cached = dataKeys.get(keyId);
    if (cached) return cached;
    const stored = withVault(file, (vault) => vault.get(account(keyId)));
    if (!stored) return undefined;
    const key = Buffer.from(stored, 'base64');
    dataKeys.set(keyId, key);
    return key;
  };

  /** The key new values are encrypted with: the file's, created when missing (a new key id when older values need the lost one) */
  const encryptionKey = (file: SecretsFile): Buffer => {
    const existing = loadKey(file, file.keyId);
    if (existing) return existing;
    if (file.secrets.some((secret) => secret.value.keyId === file.keyId)) file.keyId = newKeyId();
    const key = crypto.randomBytes(32);
    withVault(file, (vault) => vault.set(account(file.keyId), key.toString('base64')));
    dataKeys.set(file.keyId, key);
    return key;
  };

  const aad = (id: string, provider: SecretProvider) => Buffer.from(`${id}:${provider}`);

  const encrypt = (file: SecretsFile, id: string, provider: SecretProvider, value: string): EncryptedValue => {
    const key = encryptionKey(file);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(id, provider));
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { keyId: file.keyId, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  };

  const decrypt = (file: SecretsFile, secret: StoredSecret): string => {
    const unreadable = new Error(`The ${secretProviderLabel(secret.provider)} key "${secret.label}" can't be read on this machine: enter it again in Settings → Secrets`);
    const key = loadKey(file, secret.value.keyId);
    if (!key) throw unreadable;
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(secret.value.iv, 'base64'));
      decipher.setAAD(aad(secret.id, secret.provider));
      decipher.setAuthTag(Buffer.from(secret.value.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(secret.value.data, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      throw unreadable;
    }
  };

  const assertCanStore = (file: SecretsFile) => {
    if (osVaultUnavailable && vaultFor(file).protection === 'os-keystore') {
      throw new KeyVaultUnavailableError(options.osVault().backend, 'allow storing keys unprotected in Settings → Secrets');
    }
  };

  const change = (update: (secrets: StoredSecret[]) => StoredSecret[]) => {
    const file = read();
    write({ ...file, secrets: update(file.secrets) });
  };

  return {
    status() {
      const file = read();
      const vault = vaultFor(file);
      if (osVaultUnavailable && vault.protection === 'os-keystore') return { protection: 'unavailable', backend: vault.backend };
      return { protection: vault.protection, backend: vault.backend };
    },
    list: () => read().secrets.map(toSecretInfo),
    select: (id) => change((secrets) => secretRules.select(secrets, id, now())),
    rename: (id, label) => change((secrets) => secretRules.rename(secrets, id, label, now())),
    delete: (id) => change((secrets) => secretRules.remove(secrets, id)),

    add(provider, label, value) {
      const file = read();
      assertCanStore(file);
      const id = `Secret-${crypto.randomUUID()}`;
      const withMeta = secretRules.add(file.secrets, { id, provider, label, createdAt: now(), value: undefined as never });
      const encrypted = encrypt(file, id, provider, value);
      file.secrets = withMeta.map((secret) => secret.id === id ? { ...secret, value: encrypted } : secret);
      write(file);
      return toSecretInfo(file.secrets.find((secret) => secret.id === id)!);
    },

    replaceValue(id, value) {
      const file = read();
      assertCanStore(file);
      const secret = file.secrets.find((candidate) => candidate.id === id);
      if (!secret) throw new Error(`No stored key "${id}"`);
      const encrypted = encrypt(file, id, secret.provider, value);
      file.secrets = file.secrets.map((candidate) => candidate.id === id ? { ...candidate, value: encrypted, updatedAt: now() } : candidate);
      write(file);
    },

    keyFor(provider) {
      const file = read();
      return decrypt(file, secretRules.selectedFor(file.secrets, provider));
    },

    canRead(id) {
      const file = read();
      const secret = file.secrets.find((candidate) => candidate.id === id);
      if (!secret) return false;
      try {
        decrypt(file, secret);
        return true;
      } catch {
        return false;
      }
    },

    allowUnprotected() {
      const file = read();
      if (options.useFileVault || file.protection === 'unprotected') return;
      // Values the OS vault can still decrypt move to a file key; the rest stay unreadable until entered again
      const readable = new Map<string, string>();
      for (const secret of file.secrets) {
        try {
          readable.set(secret.id, decrypt(file, secret));
        } catch {
          // Unreadable here (the OS vault is gone or lost the key)
        }
      }
      const previousKeyIds = new Set(file.secrets.map((secret) => secret.value.keyId).concat(file.keyId));
      const next: SecretsFile = { ...file, protection: 'unprotected', keyId: newKeyId() };
      next.secrets = file.secrets.map((secret) => readable.has(secret.id)
        ? { ...secret, value: encrypt(next, secret.id, secret.provider, readable.get(secret.id)!) }
        : secret);
      write(next);
      osVaultUnavailable = false;
      for (const keyId of previousKeyIds) {
        try {
          options.osVault().delete(account(keyId));
        } catch {
          // Nothing to delete where the OS vault is unavailable
        }
      }
    },

    importSecrets(imported) {
      const file = read();
      const known = new Set(file.secrets.map((secret) => secret.id));
      const incoming = imported.filter((secret) => !known.has(secret.id));
      if (incoming.length === 0) return;
      assertCanStore(file);
      for (const { value, ...meta } of incoming) {
        const labelled = { ...meta, label: uniqueLabel(file.secrets, meta.provider, meta.label) };
        const added = secretRules.add(file.secrets, { ...labelled, value: undefined as never });
        const encrypted = encrypt(file, meta.id, meta.provider, value);
        file.secrets = added.map((secret) => secret.id === meta.id ? { ...secret, value: encrypted } : secret);
      }
      write(file);
    },

    clearAll() {
      fs.rmSync(options.filePath, { force: true });
    },
  };
}

/** `label`, or `label 2`, `label 3`… when the provider already has a key labelled so */
function uniqueLabel(secrets: readonly SecretInfo[], provider: SecretProvider, label: string): string {
  const taken = new Set(secrets.filter((secret) => secret.provider === provider).map((secret) => secret.label.toLowerCase()));
  let candidate = label;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${label} ${n}`;
  return candidate;
}
