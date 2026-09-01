#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf-8'));

const USAGE = `
abuddy - AgentBuddy Pack CLI

Commands:
  init [name]         Scaffold a new pack
  generate            Generate EARS types from manifest + deps
  fetch-deps          Fetch dependency type manifests
  build               Compile pack artifacts to dist/
  validate            Check manifest and types
  install <path>      Install a pack from a directory or .zip
  dev                 Watch mode for local development

Options:
  --help, -h          Show this help
  --version, -v       Show version
`.trim();

const COMMANDS: Record<string, () => Promise<(args: string[]) => Promise<void>>> = {
  'init':       async () => (await import('./commands/init')).init,
  'generate':   async () => (await import('./commands/generate')).generate,
  'fetch-deps': async () => (await import('./commands/fetch-deps')).fetchDeps,
  'build':      async () => (await import('./commands/build')).build,
  'validate':   async () => (await import('./commands/validate')).validate,
  'install':    async () => (await import('./commands/install')).install,
  'dev':        async () => (await import('./commands/dev')).dev,
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log(pkg.version);
    process.exit(0);
  }

  const loader = COMMANDS[command];
  if (!loader) {
    console.error(`Unknown command: ${command}`);
    console.log(USAGE);
    process.exit(1);
  }

  try {
    const fn = await loader();
    await fn(args.slice(1));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
