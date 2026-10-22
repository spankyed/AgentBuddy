// SPIKE: an engine whose data lives only in LMDB (see disk-storage.ts for the key schema)
/// <reference types="node" />
import { open, type Database, type RootDatabase } from 'lmdb';
import { composeEngine, type EarsEngine } from '../engine.ts';
import type { PersistenceSink } from '../runtime.ts';
import { createDiskStorage, type DiskStorage } from './disk-storage.ts';

export interface DiskEngineOptions {
  /** The environment's directory */
  path: string;
  isEntityType: (name: string) => boolean;
  persistence?: PersistenceSink;
  /** lmdb-js's decoded-value cache (default false) */
  cache?: boolean;
  /** Commit without fsync (default false): each commit is durable against a process crash, not an OS crash */
  noSync?: boolean;
  /** Value encoding (default msgpack) */
  encoding?: 'msgpack' | 'json';
  /** Index primitive values for where(k, v) and withRole (default true) */
  valueIndex?: boolean;
  indexThreshold?: number;
}

export interface DiskEngine extends EarsEngine {
  /** Runs `fn` in one write transaction */
  batch<T>(fn: () => T): T;
  storage: DiskStorage;
  root: RootDatabase;
  close(): Promise<void>;
}

export function createDiskEarsEngine({ path, isEntityType, persistence, cache = false, noSync = false, encoding = 'msgpack', valueIndex = true, indexThreshold }: DiskEngineOptions): DiskEngine {
  const root = open({ path, maxDbs: 4, noSync, cache });
  const db = root.openDB({ name: 'ears', encoding, cache }) as Database<any, any>;
  const storage = createDiskStorage({ db, persistence, valueIndex, indexThreshold });
  const engine = composeEngine({ storage, relations: storage.relations, isEntityType });
  return {
    ...engine,
    batch: storage.batch,
    storage,
    root,
    close: () => root.close(),
  };
}
