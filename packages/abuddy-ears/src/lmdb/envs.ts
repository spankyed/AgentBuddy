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
  // LMDB would create the directory before failing
  if (readOnly && !fs.existsSync(basePath)) throw new Error(`No LMDB database at ${basePath}`);
  // Ensure parent directory exists
  const parentDir = path.dirname(basePath);
  if (!readOnly && !fs.existsSync(parentDir)) {
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

/** Opens each partition's environment; `readOnly` opens existing ones without writing */
export function openShardedEnvs(paths: LmdbPaths, { readOnly = false }: { readOnly?: boolean } = {}): Record<Partition, LmdbDbs> {
  const primary = openEnvAt(paths.primary, { readOnly });
  const volatileBackup = openEnvAt(paths.volatileBackup, { readOnly });
  return { primary, volatileBackup };
}

export function closeShardedEnvs(envs: Record<Partition, LmdbDbs>, log: (message: string) => void = console.log) {
  closeEnv(envs.primary, log);
  closeEnv(envs.volatileBackup, log);
}

export function closeEnv(dbs: LmdbDbs, log: (message: string) => void = console.log): void {
  try {
    // Close child databases first, then root
    // This ensures clean shutdown even if root close fails
    dbs.entities?.close();
    dbs.attrs?.close();
    dbs.relations?.close();
    dbs.root?.close();
    log('[LMDB] Environment closed successfully');
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
