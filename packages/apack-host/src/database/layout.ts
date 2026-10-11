// Where a data dir keeps the app's stores: inside `appDir`, the one directory the app owns (@apack/sdk/env).
// Until 2026-10-01 there were two layouts — the data dir's root for a packaged app, `.data/` for a source run,
// chosen by NODE_ENV — and this module's job was to work out which. There is one, so there is nothing to work out.
import * as fs from 'node:fs';
import { _appDataPaths, type _AppDataPaths } from '@apack/sdk/utils';

/**
 * The stores of the database in `userDataDir`. Throws when the data dir holds no database, or only part of one:
 * the app writes both partitions, so a data dir missing one was copied or emptied by hand, and a tool that opened
 * it would read an app's data while writing somewhere the app never looks.
 */
export function findAppDataPaths(userDataDir: string): _AppDataPaths {
  const paths = _appDataPaths(userDataDir);
  if (!fs.existsSync(paths.lmdb) && !fs.existsSync(paths.volatileLmdb)) {
    throw new Error(`No apack database in ${userDataDir}`);
  }
  const missing = ([['the data', paths.lmdb], ['the run history', paths.volatileLmdb]] as const)
    .filter(([, dir]) => !fs.existsSync(dir));
  if (missing.length > 0) {
    throw new Error(
      `The apack database in ${userDataDir} is missing ${missing.map(([what, dir]) => `${what} (${dir})`).join(' and ')}: ` +
      'copy the whole data dir, or start apack on it once to create it',
    );
  }
  return paths;
}
