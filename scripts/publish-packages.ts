// Publishes the built copies (packages/<name>/dist/package) of @abuddy/sdk, @abuddy/ui,
// @abuddy/cli and @abuddy/testing. Run `npm run packages:build` first. Versions already on the registry are
// skipped, so re-running after a partial failure is safe. Prints "New tag:" lines, which
// changesets/action turns into git tags and GitHub releases.
//
//   tsx scripts/publish-packages.ts [--dry-run]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const PACKAGES = ['abuddy-sdk', 'abuddy-ui', 'abuddy-testing', 'abuddy-cli'];

const dryRun = process.argv.includes('--dry-run');
const repoRoot = path.resolve(import.meta.dirname, '..');

function isPublished(name: string, version: string): boolean {
  try {
    return execFileSync('npm', ['view', `${name}@${version}`, 'version'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() === version;
  } catch {
    return false;
  }
}

for (const dir of PACKAGES) {
  const packageDir = path.join(repoRoot, 'packages', dir, 'dist', 'package');
  const manifestPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${path.relative(repoRoot, packageDir)} is missing. Run: npm run packages:build`);
  }
  const { name, version } = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (isPublished(name, version)) {
    console.log(`${name}@${version} is already published`);
    continue;
  }
  const args = ['publish', packageDir, '--access', 'public'];
  if (dryRun) args.push('--dry-run');
  else args.push('--provenance');
  execFileSync('npm', args, { stdio: 'inherit' });
  if (!dryRun) console.log(`New tag: ${name}@${version}`);
}
