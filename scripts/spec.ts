// `npm run spec -- <path or name>` — run one spec file, or a few, without working out where they live.
//
// Running one spec is the cheapest check this repo has (1–3s against an 8-minute chain), and the thing that made it
// awkward was addressing: a path from a stack trace, a failing run or an editor is repo-relative, while the command
// that runs it needs a workspace name *and* the path relative to that package. This does that split.
//
// It delegates to each package's own `test` script rather than calling vitest itself, so a package's pretest guard
// (`packages:ensure` in @abuddy/cli and @app/default-setup) and its vitest config still apply, and this cannot drift
// from how the suite actually runs.
//
//   npm run spec -- packages/abuddy-sdk/tests/seed/seeder.spec.ts   a repo-relative path
//   npm run spec -- seeder                                          a name, matched against every spec file
//   npm run spec -- tests/unit/seed-parity                          a directory: every spec under it
//   npm run spec -- seeder import-is-the-verb                       several at once
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', 'dist', '.git', '.temp', 'dist-ssr', 'coverage', '__generated__']);

function specsUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return specsUnder(full);
    return /\.(spec|test)\.[cm]?[jt]sx?$/.test(e.name) ? [full] : [];
  });
}

/** Every spec in the repo, absolute */
const allSpecs = (): string[] => [...specsUnder(path.join(ROOT, 'packages')), ...specsUnder(path.join(ROOT, 'tests'))];

/** The paths an argument stands for: itself if it exists, else every spec whose path contains it */
function resolveArg(arg: string): string[] {
  const asPath = path.resolve(ROOT, arg);
  if (fs.existsSync(asPath)) return fs.statSync(asPath).isDirectory() ? specsUnder(asPath) : [asPath];
  return allSpecs().filter((f) => path.relative(ROOT, f).includes(arg));
}

/** The workspace a spec belongs to, and the path relative to it; `tests/e2e` is Playwright's, run from the root */
function ownerOf(spec: string): { pkgDir: string | null; rel: string } {
  const rel = path.relative(ROOT, spec);
  const m = /^packages\/([^/]+)\//.exec(rel);
  if (!m) return { pkgDir: null, rel };
  return { pkgDir: `packages/${m[1]}`, rel: path.relative(path.join(ROOT, 'packages', m[1]), spec) };
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npm run spec -- <path or name> [...]\n  a repo-relative path, a directory, or part of a spec\'s name');
  process.exit(2);
}

const matched = [...new Set(args.flatMap(resolveArg))].sort();
const missed = args.filter((a) => resolveArg(a).length === 0);
for (const a of missed) console.error(`No spec matches "${a}"`);
if (matched.length === 0) process.exit(1);

// Grouped so each package runs once, and in sequence: suites share the package build lock and the build stamps,
// so two at once produce failures that are about the race rather than the code (root CLAUDE.md).
const byPackage = new Map<string | null, string[]>();
for (const spec of matched) {
  const { pkgDir, rel } = ownerOf(spec);
  byPackage.set(pkgDir, [...(byPackage.get(pkgDir) ?? []), rel]);
}

let failed = 0;
for (const [pkgDir, rels] of byPackage) {
  // Playwright's, not vitest's: the root `test` script drives those, with the source condition its runner needs
  const [cmd, cwd] = pkgDir === null ? [['run', 'test', '--', ...rels], ROOT] : [['test', '--', ...rels], path.join(ROOT, pkgDir)];
  console.log(`\n→ ${pkgDir ?? 'tests/e2e (playwright)'}: ${rels.join(' ')}`);
  const run = spawnSync('npm', cmd as string[], { cwd: cwd as string, stdio: 'inherit' });
  if (run.status !== 0) failed++;
}
process.exit(failed === 0 ? 0 : 1);
