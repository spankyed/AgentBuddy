// Where a data dir keeps the app's stores: a packaged app at its root, a source run under .data/ (@abuddy/sdk/utils).
// A tool opening a data dir finds out which from the files there.
import * as fs from 'node:fs';
import { appDataPaths, type AppDataPaths } from '@abuddy/sdk/utils';

/**
 * The stores of the database in `userDataDir`, in the layout it was written in. Throws when the data dir holds no
 * database, or one in each layout (which one the app uses depends on how it runs, so a tool won't guess).
 */
export function findAppDataPaths(userDataDir: string): AppDataPaths {
  const layouts = [appDataPaths(userDataDir, { packaged: true }), appDataPaths(userDataDir, { packaged: false })]
    .filter((paths) => fs.existsSync(paths.lmdb));
  if (layouts.length === 0) throw new Error(`No AgentBuddy database in ${userDataDir}`);
  if (layouts.length > 1) {
    throw new Error(`${userDataDir} holds two AgentBuddy databases, ${layouts[0].lmdb} and ${layouts[1].lmdb}: move the one the app doesn't use aside`);
  }
  return layouts[0];
}
