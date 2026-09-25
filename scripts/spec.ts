// `npm run spec` — run the narrowest set of specs that could fail, without working out which those are.
//
// Running one spec is the cheapest check this repo has (1–3s against an eight-minute chain), and what made it
// awkward was never vitest: it was deciding what to run and then addressing it. A path from a stack trace is
// repo-relative while the command wants a workspace plus a package-relative path; and after editing a source file
// the honest answer to "what covers this?" took a grep, so the reflex was to run the whole package suite instead —
// 543 tests where 25 would do.
//
// So you do not tell it what kind of thing you are giving it:
//
//   npm run spec                            the specs your uncommitted changes affect, in every package they touch
//   npm run spec -- <spec path>             that spec
//   npm run spec -- <source file>           the specs that import it (vitest's `related`)
//   npm run spec -- <directory>             every spec under it
//   npm run spec -- <name>                  every spec whose path contains it
//   npm run spec -- <any of the above> -t "case"     anything starting with `-` goes to vitest untouched
//   npm run spec -- --changed HEAD~1        a different base for the change set
//
// Where it can, it delegates to the package's own `test` script, so @abuddy/cli's and @app/default-setup's pretest
// guard (`packages:ensure`) and each vitest config still apply and this cannot drift from how the suites run.
// `related` has no flag form, only a subcommand, so that path runs the package's pretest itself and then vitest.
// Packages run in sequence: they share the package build lock and the build stamps.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', 'dist', '.git', '.temp', 'dist-ssr', 'coverage', '__generated__']);
const IS_SPEC = /\.(spec|test)\.[cm]?[jt]sx?$/;

function specsUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return specsUnder(full);
    return IS_SPEC.test(e.name) ? [full] : [];
  });
}

const allSpecs = (): string[] => [...specsUnder(path.join(ROOT, 'packages')), ...specsUnder(path.join(ROOT, 'tests'))];

/**
 * The package holding the specs that check the repo's own tooling.
 *
 * Repo tooling is checked by specs like everything else, and those specs live in a package. Without the
 * two functions below, `packageOf` answered "none" for every path outside `packages/`, so editing
 * `scripts/lib/chain-steps.ts` printed "nothing changed inside a package" while the specs that import it
 * sat in a suite this command never ran — the one part of the repo its own command could not check.
 */
const REPO_CHECKS = 'repo-checks';

/**
 * A path whose meaning is repo-wide, so the repo checks cover it wherever it lives.
 *
 * `scripts/` because those modules are what the checks import. A vitest config because two of them read
 * every config in the repo: `suite-timeouts.spec.ts` bounds what one may declare, and
 * `chain-inputs.spec.ts` asserts the root one's project list. So a package's own config belongs to that
 * package *and* to this one, which is why `packagesFor` returns a set rather than a name.
 */
const IS_REPO_TOOLING = /^scripts\/|(^|\/)vitest\.[\w.]*config\.ts$/;

/** The package a repo path belongs to, or null for the repo root (tests/e2e is Playwright's) */
const packageOf = (rel: string): string | null =>
  /^packages\/([^/]+)\//.exec(rel)?.[1] ?? (IS_REPO_TOOLING.test(rel) ? REPO_CHECKS : null);

/** Every package whose specs could cover a change to this path */
const packagesFor = (rel: string): string[] =>
  [...new Set([packageOf(rel), IS_REPO_TOOLING.test(rel) ? REPO_CHECKS : null])].filter((p) => p !== null);

const sh = (cmd: string[], cwd: string) => spawnSync('npm', cmd, { cwd, stdio: 'inherit' }).status ?? 1;
const hasScript = (pkg: string, name: string): boolean =>
  !!JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', pkg, 'package.json'), 'utf-8')).scripts?.[name];

/** What a package is asked to run: named spec files, the files whose importers to find, or the change set */
type Work = { specs: string[]; related: string[]; changed: boolean };
const work = new Map<string | null, Work>();
const workFor = (pkg: string | null): Work => {
  if (!work.has(pkg)) work.set(pkg, { specs: [], related: [], changed: false });
  return work.get(pkg)!;
};

// Targets first, then flags: everything from the first `-` onward goes to vitest verbatim. Splitting on the first
// flag rather than filtering by prefix is what makes a flag's *value* its own — `-t "a case"`, `--changed HEAD~1`,
// `--bail 1` — without this having to know which flags take one.
const args = process.argv.slice(2);
const firstFlag = args.findIndex((a) => a.startsWith('-'));
const targets = firstFlag === -1 ? args : args.slice(0, firstFlag);
const flags = firstFlag === -1 ? [] : args.slice(firstFlag);

/** What git reports as changed, split by whether a package's specs could cover it */
function changedPaths(): { packages: string[]; elsewhere: string[] } {
  const out = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf-8' }).stdout ?? '';
  const paths = out.split('\n').filter(Boolean).map((l) => l.slice(3).trim().split(' -> ').pop()!);
  const packages = [...new Set(paths.flatMap(packagesFor))];
  return { packages, elsewhere: paths.filter((p) => packageOf(p) === null) };
}

for (const arg of targets) {
  const abs = path.resolve(ROOT, arg);
  const rel = path.relative(ROOT, abs);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    for (const s of specsUnder(abs)) workFor(packageOf(path.relative(ROOT, s))).specs.push(s);
  } else if (fs.existsSync(abs) && IS_SPEC.test(abs)) {
    workFor(packageOf(rel)).specs.push(abs);
  } else if (fs.existsSync(abs)) {
    // A source file: run what imports it, which is the question you actually have after an edit
    workFor(packageOf(rel)).related.push(abs);
  } else {
    const matches = allSpecs().filter((f) => path.relative(ROOT, f).includes(arg));
    if (matches.length === 0) { console.error(`No spec or file matches "${arg}"`); process.exit(1); }
    for (const m of matches) workFor(packageOf(path.relative(ROOT, m))).specs.push(m);
  }
}

// Nothing named, or only flags: the specs your changes affect, wherever they are
if (work.size === 0) {
  const { packages, elsewhere } = changedPaths();
  if (packages.length === 0) {
    // Saying which, because "nothing to run" reads as "nothing changed" and they are not the same: a change to
    // scripts/, docs/ or a root file is real, it just has no vitest spec that could cover it
    console.log(elsewhere.length === 0
      ? 'Nothing changed, and no spec named — nothing to run.'
      : `Nothing changed inside a package, so no spec covers it. Outside: ${elsewhere.slice(0, 5).join(', ')}${elsewhere.length > 5 ? `, +${elsewhere.length - 5} more` : ''}`);
    process.exit(0);
  }
  if (!flags.some((f) => f.startsWith('--changed'))) flags.push('--changed');
  for (const pkg of packages) workFor(pkg).changed = true;
}

let failed = 0;
for (const [pkg, { specs, related, changed }] of work) {
  const label = pkg ? `packages/${pkg}` : 'tests/e2e (playwright)';
  const cwd = pkg ? path.join(ROOT, 'packages', pkg) : ROOT;
  const relTo = (f: string) => path.relative(cwd, f);

  if (specs.length > 0 || changed) {
    const what = changed ? '(changed)' : specs.map(relTo).join(' ');
    console.log(`\n→ ${label}: ${what}`);
    // The root's `test` is Playwright's and needs `npm run test`, a package's is `npm test`
    failed += sh(pkg ? ['test', '--', ...specs.map(relTo), ...flags] : ['run', 'test', '--', ...specs.map(relTo), ...flags], cwd) === 0 ? 0 : 1;
  }
  if (related.length > 0 && pkg) {
    console.log(`\n→ ${label}: specs importing ${related.map(relTo).join(' ')}`);
    // `related` is a subcommand, so the package's own test script cannot carry it; run its guard by hand first
    if (hasScript(pkg, 'pretest') && sh(['run', 'pretest'], cwd) !== 0) { failed++; continue; }
    const run = spawnSync('npx', ['vitest', 'related', '--run', ...related.map(relTo), ...flags], { cwd, stdio: 'inherit' });
    if (run.status !== 0) failed++;
  }
}
process.exit(failed === 0 ? 0 : 1);
