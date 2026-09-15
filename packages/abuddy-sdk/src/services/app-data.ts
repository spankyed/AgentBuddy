import { hostService } from './host-services.ts';

/** A store a backup can hold: the primary database, the volatile trace store, or secrets */
export type BackupDatabase = 'lmdb' | 'volatileLmdb' | 'secretsLmdb';

export interface BackupInfo {
  timestamp: number;
  databases: BackupDatabase[];
  /** Bytes, across the backed-up databases */
  size: number;
  hasMedia: boolean;
}

/** The app's stored data as a whole: reset it, back it up, restore a backup. The host implements it. */
export interface AppDataService {
  /** Deletes all stored data and reopens empty stores (the in-memory database is cleared too) */
  reset(): Promise<void>;
  /** Copies the chosen databases (and media, with the primary database) into a new backup directory under `targetPath`; returns its path */
  exportBackup(targetPath: string, name?: string, databases?: BackupDatabase[]): Promise<string>;
  /**
   * Replaces stored data with a backup and reloads the in-memory database from it. On failure the
   * previous data is restored and reloaded, and the error is rethrown.
   */
  importBackup(backupPath: string): Promise<{ databases: BackupDatabase[] }>;
  /** A backup's metadata, or null when `backupPath` isn't a backup */
  backupInfo(backupPath: string): Promise<BackupInfo | null>;
}

/** The host's implementation, registered under `appData` */
export const appData: AppDataService = {
  reset: () => hostService('appData').reset(),
  exportBackup: (targetPath, name, databases) => hostService('appData').exportBackup(targetPath, name, databases),
  importBackup: (backupPath) => hostService('appData').importBackup(backupPath),
  backupInfo: (backupPath) => hostService('appData').backupInfo(backupPath),
};
