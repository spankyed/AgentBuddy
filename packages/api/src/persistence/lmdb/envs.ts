import { open, type Database, type RootDatabase } from 'lmdb';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type LmdbDbs = {
  entities: Database<any>;
  attrs: Database<any>;
  relations: Database<any>;
  root: RootDatabase;
};

export function openEnvAt(basePath: string): LmdbDbs {
  // Ensure parent directory exists
  const parentDir = path.dirname(basePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const root = open({
    path: basePath,
    maxDbs: 8,
    compression: true,
  });

  return {
    entities: root.openDB({ name: 'entities', encoding: 'json' }),
    attrs: root.openDB({ name: 'attrs', encoding: 'json' }),
    relations: root.openDB({ name: 'relations', encoding: 'json' }),
    root,
  };
}

export function openShardedEnvs(paths: { primary: string; volatileBackup: string; secrets: string }) {
  const primary = openEnvAt(paths.primary);
  const volatileBackup = openEnvAt(paths.volatileBackup);
  const secrets = openEnvAt(paths.secrets);
  return { primary, volatileBackup, secrets };
}

export function closeShardedEnvs(envs: { primary: LmdbDbs; volatileBackup: LmdbDbs; secrets: LmdbDbs }) {
  closeEnv(envs.primary);
  closeEnv(envs.volatileBackup);
  closeEnv(envs.secrets);
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