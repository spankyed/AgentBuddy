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
  try {
    // Close primary environment
    envs.primary.entities.close();
    envs.primary.attrs.close();
    envs.primary.relations.close();
    envs.primary.root.close();
    
    // Close volatile backup environment
    envs.volatileBackup.entities.close();
    envs.volatileBackup.attrs.close();
    envs.volatileBackup.relations.close();
    envs.volatileBackup.root.close();
    
    // Close secrets environment
    envs.secrets.entities.close();
    envs.secrets.attrs.close();
    envs.secrets.relations.close();
    envs.secrets.root.close();
    
    console.log('[LMDB] Sharded environments closed successfully');
  } catch (error) {
    console.error('[LMDB] Error closing sharded environments:', error);
  }
}

export function closeEnv(dbs: LmdbDbs): void {
  try {
    dbs.entities.close();
    dbs.attrs.close();
    dbs.relations.close();
    dbs.root.close();
    console.log('[LMDB] Environment closed successfully');
  } catch (error) {
    console.error('[LMDB] Error closing environment:', error);
  }
}