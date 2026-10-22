#!/usr/bin/env node
/**
 * Converts a copy of a data dir's databases from EARS storage format 1 to format 2, in place:
 *
 *   npx tsx scripts/ears-format-2.ts <data dir>
 *
 * Run it on a copy. The app refuses a format 1 database rather than convert it at boot, so this is the one
 * place the conversion happens, explicitly, once (`convertToFormat2`, `@apackdev/ears/lmdb`). It converts
 * each partition the data dir holds and prints what it removed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { convertToFormat2 } from '@apackdev/ears/lmdb';

/** The partition directories a data dir holds, in the app's layout or directly */
function partitions(dataDir: string): string[] {
  for (const base of [path.join(dataDir, 'apack'), dataDir]) {
    const found = ['ears-db', 'ears-trace'].map((name) => path.join(base, name)).filter((dir) => fs.existsSync(path.join(dir, 'data.mdb')));
    if (found.length) return found;
  }
  throw new Error(`No ears-db or ears-trace database under ${dataDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const dataDir = process.argv[2];
  if (!dataDir) {
    console.error('usage: npx tsx scripts/ears-format-2.ts <data dir>   (a copy: it converts in place)');
    process.exit(2);
  }
  for (const dir of partitions(path.resolve(dataDir))) {
    console.log(dir, JSON.stringify(convertToFormat2(dir)));
  }
}
