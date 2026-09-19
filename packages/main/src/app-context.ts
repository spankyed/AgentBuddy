import {app} from 'electron';
import * as path from 'node:path';
import {_inferElectronAppEnv, resolveAppContext, type AppContext} from '@abuddy/sdk/env';

declare const __ABUDDY_CHANNEL__: string;

let context: AppContext | null = null;

/**
 * Decide the app environment once, before any module touches userData, and make it the
 * source of truth for this process and everything it spawns.
 */
export function initAppContext(): AppContext {
  const env = _inferElectronAppEnv({
    playwrightTest: process.env.PLAYWRIGHT_TEST === 'true',
    isPackaged: app.isPackaged,
    channel: __ABUDDY_CHANNEL__,
    envVar: process.env.ABUDDY_ENV,
  });
  context = resolveAppContext({env});

  // Electron derives its userData dir and single-instance lock from these
  app.setName(context.appName);
  app.setPath('userData', context.userDataDir);
  // Logs belong with the data dir they describe. A run pointed at its own data dir — a Playwright worker,
  // `abuddy test` — keeps its own, instead of every run there having appended to one shared
  // ~/Library/Logs/<appName>. Read before the assignment below, so this is the caller's choice and not
  // the one made just now. Set before anything logs: electron-log resolves its file on the first write.
  if (process.env.ABUDDY_USER_DATA_DIR) app.setPath('logs', path.join(context.userDataDir, 'logs'));

  process.env.ABUDDY_ENV = context.env;
  process.env.ABUDDY_USER_DATA_DIR = context.userDataDir;
  return context;
}

export function getAppContext(): AppContext {
  if (!context) throw new Error('App context not initialized: initAppContext() must run first in initApp()');
  return context;
}
