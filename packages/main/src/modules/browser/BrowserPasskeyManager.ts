import {app, safeStorage, type WebContents} from 'electron';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import path from 'node:path';

/**
 * Makes passkeys (WebAuthn platform authenticator) work inside browser tabs.
 *
 * Electron cannot use the OS platform authenticator on macOS (Touch ID /
 * iCloud Keychain requires an Apple-restricted browser entitlement), so sites
 * like GitHub report "partial passkey support". Instead, we attach a CDP
 * virtual authenticator (WebAuthn domain) to every tab, which presents a
 * full user-verifying platform authenticator. Credentials are persisted to
 * disk, encrypted via safeStorage (OS keystore-backed).
 *
 * Security note: assertions are auto-approved without a per-use biometric
 * prompt — comparable to a password manager with autofill. The renderer is
 * notified on create/use so the user has visibility.
 */

// Matches CDP WebAuthn.Credential
interface StoredCredential {
  credentialId: string; // base64
  isResidentCredential: boolean;
  rpId?: string;
  privateKey: string; // base64 PKCS#8
  userHandle?: string; // base64
  signCount: number;
  backupEligibility?: boolean;
  backupState?: boolean;
  userName?: string;
  userDisplayName?: string;
}

export type PasskeyEvent = {kind: 'created' | 'used'; rpId: string};

const STORE_FILE = 'browser-passkeys.json';

const AUTHENTICATOR_OPTIONS = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
  // Present credentials as backed-up/synced passkeys so RPs don't warn
  defaultBackupEligibility: true,
  defaultBackupState: true,
};

export class BrowserPasskeyManager {
  // wcId → authenticatorId
  readonly #attached = new Map<number, {wc: WebContents; authenticatorId: string}>();
  // credentialId → credential
  readonly #credentials = new Map<string, StoredCredential>();
  readonly #notify: (event: PasskeyEvent) => void;
  #encryptionAvailable = false;

  constructor(notify: (event: PasskeyEvent) => void) {
    this.#notify = notify;
    try {
      this.#encryptionAvailable = safeStorage.isEncryptionAvailable();
    } catch {
      this.#encryptionAvailable = false;
    }
    if (!this.#encryptionAvailable) {
      console.warn('[Passkeys] safeStorage unavailable — passkey support disabled');
      return;
    }
    this.#load();
  }

  get #storePath(): string {
    return path.join(app.getPath('userData'), STORE_FILE);
  }

  #load(): void {
    try {
      if (!existsSync(this.#storePath)) return;
      const raw = JSON.parse(readFileSync(this.#storePath, 'utf8')) as {v: number; data: string};
      const decrypted = safeStorage.decryptString(Buffer.from(raw.data, 'base64'));
      const creds = JSON.parse(decrypted) as StoredCredential[];
      for (const cred of creds) {
        this.#credentials.set(cred.credentialId, cred);
      }
      console.log(`[Passkeys] Loaded ${creds.length} passkey(s)`);
    } catch (err) {
      console.error('[Passkeys] Failed to load passkey store:', err);
    }
  }

  #save(): void {
    try {
      const creds = [...this.#credentials.values()];
      const encrypted = safeStorage.encryptString(JSON.stringify(creds)).toString('base64');
      writeFileSync(this.#storePath, JSON.stringify({v: 1, data: encrypted}), 'utf8');
    } catch (err) {
      console.error('[Passkeys] Failed to save passkey store:', err);
    }
  }

  /** Attach a virtual authenticator to a tab's webContents. */
  attach(wc: WebContents): void {
    if (!this.#encryptionAvailable) return;
    if (this.#attached.has(wc.id)) return;

    try {
      if (!wc.debugger.isAttached()) {
        wc.debugger.attach('1.3');
      }
    } catch (err) {
      console.error('[Passkeys] Debugger attach failed:', err);
      return;
    }

    wc.debugger.on('message', (_event, method, params) => {
      this.#handleDebuggerMessage(wc.id, method, params);
    });

    // If Chromium detaches us (shouldn't normally happen), drop bookkeeping
    wc.debugger.on('detach', () => {
      this.#attached.delete(wc.id);
    });

    wc.once('destroyed', () => {
      this.#attached.delete(wc.id);
    });

    void this.#setup(wc).catch(err => {
      console.error('[Passkeys] Authenticator setup failed:', err);
    });
  }

  async #setup(wc: WebContents): Promise<void> {
    await wc.debugger.sendCommand('WebAuthn.enable');
    const {authenticatorId} = await wc.debugger.sendCommand('WebAuthn.addVirtualAuthenticator', {
      options: AUTHENTICATOR_OPTIONS,
    }) as {authenticatorId: string};

    this.#attached.set(wc.id, {wc, authenticatorId});

    // Load persisted credentials into this authenticator
    for (const credential of this.#credentials.values()) {
      await wc.debugger.sendCommand('WebAuthn.addCredential', {authenticatorId, credential})
        .catch((err: unknown) => {
          console.error(`[Passkeys] Failed to load credential for ${credential.rpId}:`, err);
        });
    }
  }

  #handleDebuggerMessage(wcId: number, method: string, params: any): void {
    if (method !== 'WebAuthn.credentialAdded' && method !== 'WebAuthn.credentialAsserted') return;

    const credential = params.credential as StoredCredential;
    const isNew = method === 'WebAuthn.credentialAdded';

    this.#credentials.set(credential.credentialId, credential);
    this.#save();
    this.#syncToOtherTabs(wcId, credential);

    const rpId = credential.rpId || 'unknown site';
    console.log(`[Passkeys] Passkey ${isNew ? 'created' : 'used'} for ${rpId}`);
    this.#notify({kind: isNew ? 'created' : 'used', rpId});
  }

  /** Keep sign counts consistent across open tabs. */
  #syncToOtherTabs(sourceWcId: number, credential: StoredCredential): void {
    for (const [wcId, {wc, authenticatorId}] of this.#attached) {
      if (wcId === sourceWcId || wc.isDestroyed()) continue;
      void (async () => {
        await wc.debugger.sendCommand('WebAuthn.removeCredential', {
          authenticatorId,
          credentialId: credential.credentialId,
        }).catch(() => {}); // may not exist yet in this tab
        await wc.debugger.sendCommand('WebAuthn.addCredential', {authenticatorId, credential});
      })().catch((err: unknown) => {
        console.error('[Passkeys] Cross-tab credential sync failed:', err);
      });
    }
  }
}
