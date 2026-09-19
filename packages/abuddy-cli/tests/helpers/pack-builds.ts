// Building real packs in a temp dir by running the CLI, for the specs that need a build rather than a
// hand-written snapshot. A pack here is a directory of files plus a `node_modules` symlink, which is
// what lets sibling packs resolve each other through `resolveFromWorkspace`.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
  compilerOptions: {
    target: 'ES2022', module: 'esnext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, noEmit: true, types: ['node'],
    customConditions: ['@abuddy/source'], allowImportingTsExtensions: true, paths: { '#generated/*': ['./src/__generated__/*'] },
  },
  include: ['src/**/*.ts'],
});

/** Writes a pack and links it to the given `node_modules`, so `abuddy build` can run in it */
export function preparePack(parent: string, name: string, files: Record<string, string>, modules: string): string {
  const dir = path.join(parent, name);
  write(dir, files);
  fs.symlinkSync(modules, path.join(dir, 'node_modules'), 'dir');
  return dir;
}

/** Builds a prepared pack, throwing with the CLI's output when it fails */
export function buildPack(dir: string, name = path.basename(dir)): string {
  const build = run(process.execPath, [CLI, 'build'], dir);
  if (build.code !== 0) throw new Error(`abuddy build failed in ${name}:\n${build.output}`);
  return build.output;
}
