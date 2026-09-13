#!/usr/bin/env node
// Runs a command whose Node processes resolve workspace @abuddy/* packages to their source (the
// @abuddy/source condition in their package.json exports). The condition is appended to any
// NODE_OPTIONS the caller set, so their flags survive.
//
//   node scripts/with-source.mjs playwright test smoke
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SOURCE_CONDITION = '--conditions=@abuddy/source';

/** NODE_OPTIONS with the source condition appended once */
export function withSourceCondition(nodeOptions = '') {
  const options = nodeOptions.split(/\s+/).filter(Boolean);
  return (options.includes(SOURCE_CONDITION) ? options : [...options, SOURCE_CONDITION]).join(' ');
}

// Run as a script (tests import withSourceCondition)
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error('Usage: node scripts/with-source.mjs <command> [args...]');
    process.exit(1);
  }
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: withSourceCondition(process.env.NODE_OPTIONS) },
    // npm's .bin shims are .cmd files on Windows
    shell: process.platform === 'win32',
  });
  for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) process.on(signal, () => child.kill(signal));
  child.on('error', (err) => {
    console.error(`${command}: ${err.message}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}
