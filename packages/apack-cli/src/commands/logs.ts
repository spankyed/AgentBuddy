import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { appDataDirFor, resolveAppContext } from '@apackdev/sdk/env';
import { parseAppChannel } from '../utils';

export function logOptions(args: string[]) {
  const { channel, args: rest } = parseAppChannel(args);
  const { values, positionals } = parseArgs({ args: rest, options: {
    follow: { type: 'boolean', short: 'f' }, lines: { type: 'string', short: 'n', default: '100' },
  }, strict: true, allowPositionals: true });
  if (positionals.length || !/^\d+$/.test(values.lines!) || !Number.isSafeInteger(Number(values.lines))) {
    throw new Error('Usage: apack logs [--channel production|beta|preview] [--follow] [--lines <count>]');
  }
  const context = resolveAppContext({ env: channel, userDataDir: appDataDirFor(channel) });
  return { file: path.join(os.homedir(), 'Library', 'Logs', context.appName, 'main.log'), lines: values.lines!, follow: Boolean(values.follow) };
}

export async function logs(args: string[]): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Installed app logs currently support macOS only.');
  const { file, lines, follow } = logOptions(args);
  if (!follow && !fs.existsSync(file)) throw new Error(`No app log yet: ${file}`);
  // macOS tail follows the filename across truncation and rotation, with bounded reads.
  const child = spawn('/usr/bin/tail', ['-n', lines, ...(follow ? ['-F'] : []), file], { stdio: 'inherit' });
  const interrupt = () => { child.kill('SIGINT'); };
  const terminate = () => { child.kill('SIGTERM'); };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') resolve();
        else reject(new Error(`Log reader exited with code ${code}`));
      });
    });
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
}
