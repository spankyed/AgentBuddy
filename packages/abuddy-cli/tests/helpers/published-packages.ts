import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PACKAGE_DIRS: Record<string, string> = {
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

/** Newest modification time of the files under dir */
function newestMtime(dir: string): number {
  return Math.max(0, ...fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => fs.statSync(path.join(entry.parentPath, entry.name)).mtimeMs));
}

/**
 * dist/ is written by `npm run packages:build`; CI builds it before these tests. Without it the
 * published-package specs skip, except in CI. A dist older than its source fails instead of
 * testing stale output.
 */
export const PACKAGES_BUILT = Object.values(PACKAGE_DIRS).every((dir) => fs.existsSync(path.join(dir, 'dist')));
if (!PACKAGES_BUILT && process.env.CI) {
  throw new Error('The published-package specs need built packages in CI. Run: npm run packages:build');
}
for (const dir of PACKAGES_BUILT ? Object.values(PACKAGE_DIRS) : []) {
  const builtAt = fs.statSync(path.join(dir, 'dist')).birthtimeMs;
  if (newestMtime(path.join(dir, 'src')) > builtAt) {
    throw new Error(`${path.relative(REPO_ROOT, dir)}/dist is older than its src. Run: npm run packages:build`);
  }
}

/**
 * A directory whose node_modules has the npm-packed @abuddy/sdk and @abuddy/ui installed, as a
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
  for (const [name, dir] of Object.entries(PACKAGE_DIRS)) {
    const [{ filename }] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', root], { cwd: dir }).toString());
    const target = path.join(modules, '@abuddy', name);
    fs.mkdirSync(target);
    execFileSync('tar', ['-xzf', path.join(root, filename), '-C', target, '--strip-components', '1']);
  }
  return root;
}
