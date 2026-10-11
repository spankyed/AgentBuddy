import * as fs from 'node:fs';
import * as path from 'node:path';
import { connect } from 'node:net';
import { resolveAppContext, appDataDirFor } from '@apackdev/sdk/env';
import { findRunningApp } from '@apackdev/host/database';
import { readApiEndpoint } from '@apackdev/host/process-liveness';
import { API_HOST } from '@apackdev/sdk/utils/pure';
import { parseTargetEnv } from '../utils';
import { validateAppBundle, PRODUCT_NAMES, type Channel } from '../app/installed-app';

export function doctorChannel(args: string[]): Channel {
  const { env, args: rest } = parseTargetEnv(['--production', ...args]);
  if (rest.length || (env !== 'production' && env !== 'beta')) throw new Error('Usage: apack doctor [-b]');
  return env;
}

function reachable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ host: API_HOST, port });
    const finish = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(2_000, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

/** Read-only diagnostics. Tests supply temporary installation and data paths. */
export async function inspectApp(channel: Channel, options: {
  applications?: string;
  dataDir?: string;
  probe?: (port: number) => Promise<boolean>;
} = {}): Promise<void> {
  const product = PRODUCT_NAMES[channel];
  const bundle = path.join(options.applications ?? '/Applications', `${product}.app`);
  const context = resolveAppContext({ build: channel, profile: options.dataDir ?? appDataDirFor(channel) });
  let failures = 0;
  const check = async (label: string, run: () => string | Promise<string>) => {
    try { console.log(`  ✓ ${label}: ${await run()}`); }
    catch (error) { failures++; console.log(`  ✗ ${label}: ${error instanceof Error ? error.message : error}`); }
  };
  console.log(`${product} health check\n`);
  await check('Installation', () => {
    const version = validateAppBundle(bundle, channel);
    return `${version} — ${bundle}`;
  });
  await check('Data directory', () => {
    if (!fs.existsSync(context.userDataDir)) return `${context.userDataDir} (not created yet)`;
    if (!fs.statSync(context.userDataDir).isDirectory()) throw new Error(`Not a directory: ${context.userDataDir}`);
    fs.accessSync(context.userDataDir, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
    return context.userDataDir;
  });
  await check('Runtime', async () => {
    const running = findRunningApp(context);
    const endpoint = readApiEndpoint(context.apiPortFile);
    if (!running && !endpoint) return 'app is closed; API check skipped';
    if (!endpoint) throw new Error(`${running?.why}; no live API endpoint`);
    if (!await (options.probe ?? reachable)(endpoint.port)) throw new Error(`API port ${endpoint.port} is unreachable`);
    return `API listener reachable on port ${endpoint.port} (pid ${endpoint.pid})`;
  });
  if (failures) throw new Error(`App health check failed: ${failures} check(s).`);
}

export async function doctor(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: apack doctor [-b]\n\nInspect the installed production app, its data directory, and its API listener if running. -b selects beta. Nothing is launched or modified. Pack checks are apack pack doctor.');
    return;
  }
  const channel = doctorChannel(args);
  if (process.platform !== 'darwin') throw new Error('Installed app diagnostics currently support macOS only.');
  await inspectApp(channel);
}
