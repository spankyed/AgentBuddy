// Where a data dir keeps the app's stores: a packaged app at its root, a source run under .data/ (@abuddy/sdk/utils).
// A tool opening a data dir finds out which from the files there.
import * as fs from 'node:fs';
import { _appDataPaths, type _AppDataPaths } from '@abuddy/sdk/utils';

/**
 * The stores of the database in `userDataDir`, in the layout it was written in. Throws when the data dir holds no
 * database, one in each layout (which one the app uses depends on how it runs, so a tool won't guess), or only part
 * of one: the app writes both partitions, so a data dir missing one was copied or emptied by hand, and a tool that
 * opened it would read an app's data while writing somewhere the app never looks.
 */
export function findAppDataPaths(userDataDir: string): _AppDataPaths {
  const layouts = [_appDataPaths(userDataDir, { packaged: true }), _appDataPaths(userDataDir, { packaged: false })]
    .filter((paths) => fs.existsSync(paths.lmdb) || fs.existsSync(paths.volatileLmdb));
  if (layouts.length === 0) throw new Error(`No AgentBuddy database in ${userDataDir}`);
  if (layouts.length > 1) {
    throw new Error(`${userDataDir} holds two AgentBuddy databases, ${layouts[0].lmdb} and ${layouts[1].lmdb}: move the one the app doesn't use aside`);
  }
  const [paths] = layouts;
  const missing = ([['the data', paths.lmdb], ['the run history', paths.volatileLmdb]] as const)
    .filter(([, dir]) => !fs.existsSync(dir));
  if (missing.length > 0) {
    throw new Error(
      `The AgentBuddy database in ${userDataDir} is missing ${missing.map(([what, dir]) => `${what} (${dir})`).join(' and ')}: ` +
      'copy the whole data dir, or start AgentBuddy on it once to create it',
    );
  }
  return paths;
}
