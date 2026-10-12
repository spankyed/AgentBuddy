import * as fs from 'node:fs';
import * as path from 'node:path';
import { appDataDirFor, resolveAppEnvironment, type AppChannel } from '@apackdev/sdk/env';
import { findRunningApp } from '@apackdev/host/database';
import { parseAppChannel } from '../utils';
import { installedVersion } from '../app/installed-app';
import { PRODUCT_NAMES } from '../app/channels';

export const STATUS_USAGE = 'Usage: apack status [--channel production|beta|preview] [--json]';

export function appStatus(channel: AppChannel, options: { applications?: string; dataDir?: string } = {}) {
  const appPath = path.join(options.applications ?? '/Applications', `${PRODUCT_NAMES[channel]}.app`);
  const context = resolveAppEnvironment({ env: channel, userDataDir: options.dataDir ?? appDataDirFor(channel) });
  const running = findRunningApp(context);
  return {
    channel, installed: fs.existsSync(appPath), version: installedVersion(appPath), appPath,
    running: running !== null, runtime: running?.why ?? null, dataDir: context.userDataDir,
  };
}

export async function status(args: string[]): Promise<void> {
  const { channel, args: rest } = parseAppChannel(args);
  if (rest.some(arg => arg !== '--json') || rest.length > 1) throw new Error(STATUS_USAGE);
  if (process.platform !== 'darwin') throw new Error('Installed app status currently supports macOS only.');
  const result = appStatus(channel);
  if (rest.includes('--json')) console.log(JSON.stringify(result));
  else console.log(`${PRODUCT_NAMES[channel]}: ${result.installed ? result.version ?? 'version unreadable' : 'not installed'}\nDefault profile: ${result.running ? 'running' : 'closed'}\nApp: ${result.appPath}\nData: ${result.dataDir}`);
}
