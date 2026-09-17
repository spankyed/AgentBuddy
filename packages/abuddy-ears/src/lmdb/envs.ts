/// <reference types="node" />
import { open, type Database, type RootDatabase } from 'lmdb';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Partition } from '../persistence/policy.ts';

/** The databases of one LMDB environment: entity records, attribute rows and relations */
export type LmdbDbs = {
  entities: Database<any>;
  attrs: Database<any>;
  relations: Database<any>;
  root: RootDatabase;
};

/** Opens (creating it if needed) the LMDB environment at `basePath`; `readOnly` opens an existing one without writing */
export function openEnvAt(basePath: string, { readOnly = false }: { readOnly?: boolean } = {}): LmdbDbs {
  // Ensure parent directory exists
  const parentDir = path.dirname(basePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const root = open({
    path: basePath,
    maxDbs: 8,
    compression: true,
    readOnly,
  });

  return {
    entities: root.openDB({ name: 'entities', encoding: 'json' }),
    attrs: root.openDB({ name: 'attrs', encoding: 'json' }),
    relations: root.openDB({ name: 'relations', encoding: 'json' }),
    root,
  };
}

/** Each partition's database directory */
export type LmdbPaths = Record<Partition, string>;

export function openShardedEnvs(paths: LmdbPaths): Record<Partition, LmdbDbs> {
  const primary = openEnvAt(paths.primary);
  const volatileBackup = openEnvAt(paths.volatileBackup);
  return { primary, volatileBackup };
}

export function closeShardedEnvs(envs: Record<Partition, LmdbDbs>) {
  closeEnv(envs.primary);
  closeEnv(envs.volatileBackup);
}

export function closeEnv(dbs: LmdbDbs): void {
  try {
    // Close child databases first, then root
    // This ensures clean shutdown even if root close fails
    dbs.entities?.close();
    dbs.attrs?.close();
    dbs.relations?.close();
    dbs.root?.close();
    console.log('[LMDB] Environment closed successfully');
  } catch (error: any) {
    // Only log unexpected errors (not "already closed" errors)
    if (!error?.message?.includes('Dbi is not open') &&
        !error?.message?.includes('already been closed')) {
      console.error('[LMDB] Error closing environment:', error);
    }
  }
}

/** Delete all LMDB database directories. Must be called after connections are closed. */
export function deleteLmdbDirectories(paths: LmdbPaths): void {
  for (const dbPath of [paths.primary, paths.volatileBackup]) {
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { recursive: true, force: true });
    }
  }
}
