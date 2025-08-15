import { open, type Database } from 'lmdb';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLmdbPath } from '@/core/utils/paths';

export type Dbs = {
  entities: Database<any>;
  attrs: Database<any>;
  relations: Database<any>;
};

export function openEnv(customPath?: string): Dbs {
  const base = customPath ?? getLmdbPath();
  
  // Ensure parent directory exists
  const parentDir = path.dirname(base);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  
  // Let LMDB handle everything else
  const root = open({
    path: base,
    maxDbs: 8,
    compression: true,
  });

  const entities = root.openDB({ name: 'entities', encoding: 'json' });
  const attrs = root.openDB({ name: 'attrs', encoding: 'json' });
  const relations = root.openDB({ name: 'relations', encoding: 'json' });

  return { entities, attrs, relations };
}