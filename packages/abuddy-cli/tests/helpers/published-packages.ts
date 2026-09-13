import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PACKAGE_DIRS: Record<string, string> = {
  sdk: path.join(REPO_ROOT, 'packages', 'abuddy-sdk'),
  ui: path.join(REPO_ROOT, 'packages', 'abuddy-ui'),
};

/** dist/ is written by `npm run packages:build`; CI builds it before these tests. */
export const PACKAGES_BUILT = Object.values(PACKAGE_DIRS).every((dir) => fs.existsSync(path.join(dir, 'dist')));

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
