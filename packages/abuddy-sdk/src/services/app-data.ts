
/** A store a backup can hold: the primary database or the volatile trace store. API keys are never backed up. */
export type BackupDatabase = 'lmdb' | 'volatileLmdb';

export interface BackupInfo {
  timestamp: number;
  databases: BackupDatabase[];
  /** Bytes, across the backed-up databases */
  size: number;
  hasMedia: boolean;
}

/**
 * The app's stored data as a whole: reset it, back it up, restore a backup, and whether the user finished
 * onboarding (the app's own state, which the host keeps). The host implements it.
 */
export interface AppDataService {
  /**
   * Resets the whole app: deletes all stored data and keys, reopens empty stores (the in-memory database is cleared
   * too), then runs each pack's init hook, the boot seed and the app migrations. Onboarding starts over
   */
  reset(): Promise<void>;
  /** Whether the user finished onboarding */
  hasOnboarded(): boolean;
  /** Records that the user finished onboarding: the app opens without its onboarding from then on */
  completeOnboarding(): void;
  /** Copies the chosen databases (and media, with the primary database) into a new backup directory under `targetPath`; returns its path */
  exportBackup(targetPath: string, name?: string, databases?: BackupDatabase[]): Promise<string>;
  /**
   * Replaces stored data with a backup and reloads the in-memory database from it. On failure the
   * previous data is restored and reloaded, and the error is rethrown.
   *
   * A backup holding stores this AgentBuddy doesn't have (one a newer version made) is refused with
   * `UnknownBackupDatabasesError`, since restoring it would replace the user's data with an incomplete copy.
   * `skipUnknownDatabases` imports it anyway, without those stores, once the user has said so.
   */
  importBackup(backupPath: string, options?: { skipUnknownDatabases?: boolean }): Promise<{ databases: BackupDatabase[] }>;
  /** A backup's metadata, or null when `backupPath` isn't a backup */
  backupInfo(backupPath: string): Promise<BackupInfo | null>;
}

/**
 * A backup holds stores this AgentBuddy doesn't have, so restoring it would replace the user's data with an
 * incomplete copy of it. The app asks the user before importing it without them; `abuddy db import` takes
 * `--skip-unknown`.
 */
export class UnknownBackupDatabasesError extends Error {
  constructor(readonly databases: string[]) {
    super(`The backup holds data this AgentBuddy doesn't have: ${databases.join(', ')}. It was made by a newer AgentBuddy, and importing it would replace your data with an incomplete copy.`);
    this.name = 'UnknownBackupDatabasesError';
  }
}
