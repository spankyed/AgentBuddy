import * as fs from 'node:fs';
import * as path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf-8'));

const USAGE = `
abuddy - AgentBuddy Pack CLI

Commands:
  init [name]         Scaffold a new pack
  add <entity>        Add a feature, step, seed, etc.
  generate-entries    Generate __generated__/ files from manifest
  fetch-deps          Fetch dependency type manifests
  build [--skip-generate]  Compile the pack to dist/
  pack                Bundle dist/ into a verified .tgz + .sha256
  release [patch|minor|major] [--beta] [--dry-run] [--local]  Cut a release
  validate            Check manifest and types
  facade-report [--update]  Report the pack's facade types (etc/pack-types.api.md)
  install <source> [-d] [-b]  Install a pack (path, URL, GitHub, or registry name)
  uninstall <id> [-d] [-b]   Remove an installed pack
  list [-d] [-b]             Show installed packs
  run [--app-root <path> | --app beta] [--instance <name> | --fresh | --ephemeral]
                      Launch the app with this pack, and reload it as you edit
  init-tests            Scaffold Playwright E2E test setup
  drive [script]        Launch the app and drive it from a script in drive/ (not a test)
  test [args...]        Run E2E tests in AgentBuddy (--app-root <path> | --app beta)
  open [-b]           Open the installed AgentBuddy app
  db <command>        Query, export, import or reset the app's database (AgentBuddy closed)
  info                Show pack summary
  doctor              Run health checks
  instances           List every AgentBuddy data dir; create, rename or remove an instance
  clean [--apps]      Remove this pack's build output, or the downloaded Beta builds

Options:
  --help, -h          Show this help
  --version, -v       Show version
`.trim();

const COMMANDS: Record<string, () => Promise<(args: string[]) => Promise<void>>> = {
  'init':              async () => (await import('./commands/init')).init,
  'add':               async () => (await import('./commands/add')).add,
  'generate-entries':  async () => (await import('./commands/generate-entries')).generateEntries,
  'fetch-deps':        async () => (await import('./commands/fetch-deps')).fetchDeps,
  'build':      async () => (await import('./commands/build')).buildCommand,
  'pack':       async () => (await import('./commands/pack')).pack,
  'facade-report':     async () => (await import('./commands/facade-report')).facadeReport,
  'release':    async () => (await import('./commands/release')).release,
  'validate':   async () => (await import('./commands/validate')).validate,
  'install':    async () => (await import('./commands/install')).install,
  'uninstall':  async () => (await import('./commands/uninstall')).uninstall,
  'list':       async () => (await import('./commands/list')).list,
  'run':        async () => (await import('./commands/run')).run,
  'init-tests': async () => (await import('./commands/init-tests')).initTests,
  'drive':      async () => (await import('./commands/drive')).drive,
  'test':       async () => (await import('./commands/test')).test,
  'open':       async () => (await import('./commands/open')).open,
  'db':         async () => (await import('./commands/db')).db,
  'info':       async () => (await import('./commands/info')).info,
  'doctor':     async () => (await import('./commands/doctor')).doctor,
  'instances':  async () => (await import('./commands/instances')).instances,
  'clean':      async () => (await import('./commands/clean')).clean,
};

/**
 * Exit quietly when whatever is reading our stdout goes away.
 *
 * `abuddy instances | head` closes the pipe under the writer, and an unhandled EPIPE crashes with a stack
 * trace that reads like a failure of the command. Every command could always hit this; none did, because
 * none printed more than fits the pipe buffer before the reader exits — `abuddy instances` is the first
 * with a table long enough, which is how it was found.
 *
 * Only EPIPE: attaching a listener at all stops Node throwing on any stdout error, so anything else would
 * be swallowed silently, which is worse than the crash this prevents. `process.exit` is right here and
 * almost nowhere else — stdout is already closed, so there is nothing left to flush.
 *
 * `scripts/lib/exit-on-epipe.ts` is the same five lines for the repo's own orchestrators. Not imported:
 * `check:specifiers` refuses a package reaching into `scripts/`, because a module there belongs to no
 * package and `npm run spec` could not route a change to it back to anything that covers it.
 */
function exitOnEpipe(): void {
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE') throw err;
    process.exit(0);
  });
}

async function main() {
  exitOnEpipe();
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
