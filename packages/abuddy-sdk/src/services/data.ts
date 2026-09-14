import { getHostModule } from '../runtime/host.ts';
import type { EARS } from '../types/entities.ts';

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

/** An entity row's bookkeeping in the trace store */
export interface TraceEntityMeta {
  type: string;
  createdAt: number;
  deletedAt?: number;
}

export interface TraceRelation {
  kind: string;
  src: EARS.EntityId;
  tgt: EARS.EntityId;
  info?: unknown;
  createdAt: number;
}

/** Read-only access to the volatile trace store: flow execution records (TNodes), kept out of the in-memory database */
export interface TraceStore {
  /** Every entity in the store, with its bookkeeping */
  entities(): Array<{ id: EARS.EntityId; meta: TraceEntityMeta }>;
  getEntityMeta(id: EARS.EntityId): TraceEntityMeta | null;
  /** The attribute's first value, or undefined */
  getAttr(kind: string, id: EARS.EntityId): unknown;
  /** Relations matching the filter; relations to deleted entities are skipped unless `skipDeleted` is false */
  relations(filter?: { kind?: string; src?: EARS.EntityId; tgt?: EARS.EntityId; skipDeleted?: boolean; limit?: number }): Array<{ id: string; rel: TraceRelation }>;
}

/** The host's implementation, registered as host module "app-data" */
export const appData: AppDataService = {
  reset: () => getHostModule<AppDataService>('app-data').reset(),
  exportBackup: (targetPath, name, databases) => getHostModule<AppDataService>('app-data').exportBackup(targetPath, name, databases),
  importBackup: (backupPath) => getHostModule<AppDataService>('app-data').importBackup(backupPath),
  backupInfo: (backupPath) => getHostModule<AppDataService>('app-data').backupInfo(backupPath),
};

/** The host's implementation, registered as host module "trace-store" */
export const traceStore: TraceStore = {
  entities: () => getHostModule<TraceStore>('trace-store').entities(),
  getEntityMeta: (id) => getHostModule<TraceStore>('trace-store').getEntityMeta(id),
  getAttr: (kind, id) => getHostModule<TraceStore>('trace-store').getAttr(kind, id),
  relations: (filter) => getHostModule<TraceStore>('trace-store').relations(filter),
};
