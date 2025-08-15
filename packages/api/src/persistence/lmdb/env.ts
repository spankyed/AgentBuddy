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
  fs.mkdirSync(base, { recursive: true });

  // Root env (opening sub-dbs via name)
  const root = open({
    path: base,
    // LMDB will auto-resize as needed; you can set an initial map size if you like:
    // mapSize: 1024 * 1024 * 1024, // 1 GiB initial
    maxDbs: 8,
    compression: true,       // built-in dictionary compression for values
  });

  const entities = root.openDB({ name: 'entities', encoding: 'json' });
  const attrs = root.openDB({ name: 'attrs', encoding: 'json' });
  const relations = root.openDB({ name: 'relations', encoding: 'json' });

  return { entities, attrs, relations };
}