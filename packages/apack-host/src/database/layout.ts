// Where a data dir keeps the app's stores: inside `appDir`, the one directory the app owns (@apackdev/sdk/env).
// Until 2026-10-01 there were two layouts — the data dir's root for a packaged app, `.data/` for a source run,
// chosen by NODE_ENV — and this module's job was to work out which. There is one, so there is nothing to work out.
import * as fs from 'node:fs';
import { _appDataPaths, type _AppDataPaths } from '@apackdev/sdk/utils';

/**
 * The stores of the database in `userDataDir`. Throws when the data dir holds no database: a tool that opened one
 * there would write somewhere the app never looks. The run history needs no check: it is a store of its own, and
 * one that isn't there yet is created empty by whoever opens it.
 */
export function findAppDataPaths(userDataDir: string): _AppDataPaths {
  const paths = _appDataPaths(userDataDir);
  if (!fs.existsSync(paths.lmdb)) throw new Error(`No apack database in ${userDataDir}`);
  return paths;
}
