// Building real packs in a temp dir by running the CLI, for the specs that need a build rather than a
// hand-written snapshot. A pack here is a directory of files plus a `node_modules` symlink, which is
// what lets sibling packs resolve each other through `resolveFromWorkspace`.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PACK_TSCONFIG } from '../../src/commands/init';
import { REPO_ROOT } from './published-packages';

/** The CLI these specs build with: the repo's own bin, run from source */
export const CLI = path.join(REPO_ROOT, 'packages', 'abuddy-cli', 'bin', 'abuddy.mjs');
export const TSC = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc');

/** Runs a command, returning its status and combined output instead of throwing, so a spec can assert on both */
export function run(cmd: string, args: string[], cwd: string): { code: number; output: string } {
  try {
    return { code: 0, output: execFileSync(cmd, args, { cwd, stdio: 'pipe', env: { ...process.env, FORCE_COLOR: '0' } }).toString() };
  } catch (err: any) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/**
 * The commands `callCli` can run, by the name the CLI's argv dispatch uses (`src/index.ts`). `build`
 * is the inner `build`, not `buildCommand`: the wrapper's only extra is `ensureCheckoutPackages`, a
 * freshness check the suite's own `pretest` already made once for the whole run.
 */
const COMMANDS = {
  'init': async () => (await import('../../src/commands/init')).init,
  'add': async () => (await import('../../src/commands/add')).add,
  'generate-entries': async () => (await import('../../src/commands/generate-entries')).generateEntries,
  'build': async () => (await import('../../src/commands/build')).build,
  'pack': async () => (await import('../../src/commands/pack')).pack,
  'init-tests': async () => (await import('../../src/commands/init-tests')).initTests,
} satisfies Record<string, () => Promise<(args: string[]) => unknown>>;

/**
 * Registered once per process, as `bin/abuddy.mjs` does for a spawn: the CLI loads a pack's TypeScript
 * by dynamic import, and those files sit in a temp dir outside vitest's root, where its own transform
 * does not reach.
 */
let tsxRegistered = false;
async function registerTsx(): Promise<void> {
  if (tsxRegistered) return;
  (await import('tsx/esm/api')).register();
  tsxRegistered = true;
}

/**
 * Runs a CLI command in this process against `dir`, returning what `run` returns so a call site reads
 * the same either way. For the spawns that exist to *produce* something — a built pack, a scaffold —
 * where the process boundary is cost rather than coverage; a test asserting on an exit code, stderr or
 * argv keeps `run`, because that is what it is testing.
 *
 * Measured on a minimal pack: three builds cost 14.1s spawned and 7.4s here, because esbuild, vite and
 * tailwind load once for the file instead of once per build.
 *
 * Two pieces of global state make this safe only for tests that run one at a time, which is every test
 * in this suite — vitest gives each file its own forked process and runs its tests in sequence:
 *
 * - the commands read `process.cwd()` rather than taking a root, so this chdirs and restores;
 * - a command that fails calls `process.exit`, which would take the worker with it, so that is swapped
 *   for a throw and reported as `code` instead.
 */
export async function callCli(dir: string, command: keyof typeof COMMANDS, args: string[] = []): Promise<{ code: number; output: string }> {
  await registerTsx();
  const chunks: string[] = [];
  const cwd = process.cwd();
  const console_ = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const exit = process.exit;
  const capture = (...parts: unknown[]) => { chunks.push(`${parts.map(String).join(' ')}\n`); };
  class Exited extends Error { constructor(readonly code: number) { super(`process.exit(${code})`); } }
  try {
    process.chdir(dir);
    Object.assign(console, { log: capture, error: capture, warn: capture, info: capture });
    process.exit = ((code?: number) => { throw new Exited(code ?? 0); }) as typeof process.exit;
    await (await COMMANDS[command]())(args);
    return { code: 0, output: chunks.join('') };
  } catch (err) {
    return { code: err instanceof Exited ? err.code : 1, output: `${chunks.join('')}${err instanceof Exited ? '' : String(err)}` };
  } finally {
    process.chdir(cwd);
    Object.assign(console, console_);
    process.exit = exit;
  }
}

/** Writes a tree of files under `dir`, creating directories as needed */
export function write(dir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), typeof content === 'string' ? content : JSON.stringify(content));
  }
}

/** A pack's package.json: the `#generated/*` subpath imports are what its generated code is reached by */
export const packageJson = (name: string) =>
  JSON.stringify({ name, type: 'module', imports: { '#generated/*': './src/__generated__/*' } });

/**
 * A pack's tsconfig. It declares `@abuddy/source` because these packs sit inside the checkout and
 * resolve the workspace packages; a pack author's config declares none (see the root CLAUDE.md), which
 * `check:specifiers` records as `DECLARES_SOURCE_BY_DESIGN` for this file's callers.
 */
export const tsconfig = JSON.stringify({
  ...PACK_TSCONFIG,
  // The one deliberate difference: these packs sit inside the checkout and resolve the workspace
  // packages. Everything else, `include` above all, is the scaffold's, so a test pack compiles the
  // same file set a real one does.
  compilerOptions: { ...PACK_TSCONFIG.compilerOptions, customConditions: ['@abuddy/source'] },
});

/** Writes a pack and links it to the given `node_modules`, so `abuddy build` can run in it */
export function preparePack(parent: string, name: string, files: Record<string, string>, modules: string): string {
  const dir = path.join(parent, name);
  write(dir, files);
  fs.symlinkSync(modules, path.join(dir, 'node_modules'), 'dir');
  return dir;
}

/** Builds a prepared pack, throwing with the CLI's output when it fails */
export async function buildPack(dir: string, name = path.basename(dir)): Promise<string> {
  const build = await callCli(dir, 'build');
  if (build.code !== 0) throw new Error(`abuddy build failed in ${name}:\n${build.output}`);
  return build.output;
}
