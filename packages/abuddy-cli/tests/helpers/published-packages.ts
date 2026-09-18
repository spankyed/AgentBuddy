import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BUILD_UNITS, staleMessage, stalePackageUnits } from '../../../../scripts/ensure-packages-built.ts';

const execFileAsync = promisify(execFile);

export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/**
 * The packages `installPublishedPackages()` npm-packs into a consumer fixture, by the name a
 * consumer installs them as. Deliberately not the build-freshness watch list (`BUILD_UNITS`), which
 * covers everything a build reads — `@abuddy/host` and `@abuddy/testing` among it — and must be
 * free to grow without changing what is packed into a fixture.
 * `tests/build/package-freshness.spec.ts` checks every packed package is one the build builds.
 */
export const PACKED_PACKAGES: Record<string, string> = {
  ears: path.join(REPO_ROOT, 'packages', 'abuddy-ears'),
  sdk: path.join(REPO_ROOT, 'packages', 'abuddy-sdk'),
  ui: path.join(REPO_ROOT, 'packages', 'abuddy-ui'),
};

/** Compilers consumers may use: the workspace TypeScript and the oldest the packages support (their typescript peer) */
export const TSC_VERSIONS = {
  current: path.join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
  '5.7': path.join(REPO_ROOT, 'packages', 'typescript-floor', 'node_modules', 'typescript', 'bin', 'tsc'),
} as const;
export type TscVersion = keyof typeof TSC_VERSIONS;
/** Every TypeScript version × moduleResolution a consumer may use */
export const CONSUMER_MATRIX = (Object.keys(TSC_VERSIONS) as TscVersion[])
  .flatMap((tsc) => (['node16', 'bundler'] as const).map((moduleResolution) => ({ tsc, moduleResolution })));

/**
 * Whether every `BUILD_UNITS` output exists: specs reading build output guard on it, and skip
 * without one — except in CI, where nothing should be unbuilt. The staleness check below catches a
 * run that bypassed the suite's `pretest` (`npx vitest`, a watch run): it reads the same verdict the
 * pretest acts on, so the two can't disagree, and refuses rather than testing stale output.
 * Importing this never builds; that is the pretest's job, in its own process.
 */
export const PACKAGES_BUILT = Object.values(BUILD_UNITS).every((unit) => unit.outputs.every((output) => fs.existsSync(output)));
if (!PACKAGES_BUILT && process.env.CI) {
  throw new Error('The published-package specs need built packages in CI. Run: npm run packages:build');
}
const stale = PACKAGES_BUILT ? stalePackageUnits() : [];
if (stale.length > 0) {
  throw new Error(`The published packages are out of date:\n${staleMessage(stale)}\nRun: npm run packages:build (or npm test -w @abuddy/cli, which builds them)`);
}

/**
 * A directory whose node_modules has the npm-packed @abuddy/ears, @abuddy/sdk and @abuddy/ui installed, as a
 * pack gets them from the registry, and links to the monorepo's copies of everything else.
 */
export function installPublishedPackages(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-published-'));
  const modules = path.join(root, 'node_modules');
  fs.mkdirSync(path.join(modules, '@abuddy'), { recursive: true });
  for (const entry of fs.readdirSync(path.join(REPO_ROOT, 'node_modules'))) {
    if (entry === '@abuddy' || entry.startsWith('.')) continue;
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules', entry), path.join(modules, entry), 'dir');
  }
  for (const [name, dir] of Object.entries(PACKED_PACKAGES)) {
    const [{ filename }] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', root], { cwd: dir }).toString());
    const target = path.join(modules, '@abuddy', name);
    fs.mkdirSync(target);
    execFileSync('tar', ['-xzf', path.join(root, filename), '-C', target, '--strip-components', '1']);
  }
  return root;
}

/**
 * Compiles `files` (name → lines) as a consumer package in `dir`, with the chosen compiler and module
 * resolution: tsc's exit code and output.
 */
export async function compileConsumer(
  dir: string,
  tsc: TscVersion,
  moduleResolution: 'node16' | 'bundler',
  files: Record<string, string[]>,
  { skipLibCheck = true, types = [] as string[] } = {},
): Promise<{ code: number; output: string }> {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module' }));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: moduleResolution === 'node16' ? 'node16' : 'esnext', moduleResolution,
      strict: true, skipLibCheck, noEmit: true, types, lib: ['ES2022', 'DOM'],
    },
    include: Object.keys(files),
  }));
  for (const [name, lines] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), lines.join('\n'));
  try {
    const { stdout } = await execFileAsync(process.execPath, [TSC_VERSIONS[tsc], '-p', dir]);
    return { code: 0, output: stdout };
  } catch (err: any) {
    return { code: err.code ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}
