#!/usr/bin/env tsx
import * as fs from 'node:fs';
import * as path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'package.json'), 'utf-8'));

const USAGE = `
abuddy - AgentBuddy Pack CLI

Commands:
  init [name]         Scaffold a new pack
  add <entity>        Add a feature, step, seed, etc.
  generate            Generate EARS types from manifest + deps
  generate-entries    Generate __generated__/ files from manifest
  fetch-deps          Fetch dependency type manifests
  build [--skip-generate]  Compile pack artifacts to dist/
  pack                Bundle dist/ into a .tgz for release
  validate            Check manifest and types
  install <source> [-d]  Install a pack (path, URL, GitHub, or registry name)
  uninstall <id> [-d]   Remove an installed pack
  list [-d]             Show installed packs
  dev                   Dev server with HMR (always targets dev environment)
  init-tests            Scaffold Playwright E2E test setup
  info                Show pack summary
  doctor              Run health checks
  clean               Remove build artifacts

Options:
  --help, -h          Show this help
  --version, -v       Show version
`.trim();

const COMMANDS: Record<string, () => Promise<(args: string[]) => Promise<void>>> = {
  'init':              async () => (await import('./commands/init')).init,
  'add':               async () => (await import('./commands/add')).add,
  'generate':          async () => (await import('./commands/generate')).generate,
  'generate-entries':  async () => (await import('./commands/generate-entries')).generateEntries,
  'fetch-deps':        async () => (await import('./commands/fetch-deps')).fetchDeps,
  'build':      async () => (await import('./commands/build')).build,
  'pack':       async () => (await import('./commands/pack')).pack,
  'validate':   async () => (await import('./commands/validate')).validate,
  'install':    async () => (await import('./commands/install')).install,
  'uninstall':  async () => (await import('./commands/uninstall')).uninstall,
  'list':       async () => (await import('./commands/list')).list,
  'dev':        async () => (await import('./commands/dev')).dev,
  'init-tests': async () => (await import('./commands/init-tests')).initTests,
  'info':       async () => (await import('./commands/info')).info,
  'doctor':     async () => (await import('./commands/doctor')).doctor,
  'clean':      async () => (await import('./commands/clean')).clean,
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
