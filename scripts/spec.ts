// `npm run spec` — run the specs that could fail because of what you changed.
//
// Running one spec is the cheapest check this repo has (1-3s against a chain run), and what made it awkward
// was never vitest: it was deciding what to run and then addressing it. A path from a stack trace is
// repo-relative while the command wants a workspace plus a package-relative path; and after editing a source
// file the honest answer to "what covers this?" took a grep, so the reflex was to run the whole package
// suite instead — 543 tests where 25 would do.
//
// So you do not tell it what kind of thing you are giving it:
//
//   npm run spec                            the specs your uncommitted changes affect
//   npm run spec -- <spec path>             that spec
//   npm run spec -- <name>                  every spec whose path contains it — how you run one while working
//   npm run spec -- <directory>             every spec under it
//   npm run spec -- <source file>           every spec that imports it, transitively, in whatever package
//   npm run spec -- <any of the above> -t "case"     anything starting with `-` goes to vitest untouched
//   npm run spec -- --changed HEAD~1        a different base for the change set
//
// A **source file** is the case worth knowing about. It used to run the file's own package, which for
// `@abuddy/sdk` was one of the seven suites that cover it: a green run of specs that could not fail for the
// change. It now runs one vitest over every host project, which is what the root `vitest.config.ts` is for.
// That costs what the blast radius costs — a component nothing imports is still 1-3s, a type every pack's
// data flows through is 28s and 104 files. To go back to one spec while iterating, name it.
//
// Where it can, it delegates to the package's own `test` script, so @abuddy/cli's and @app/default-setup's
// pretest guard (`packages:ensure`) and each vitest config still apply. A root run has no such hook, so the
// plan puts `packages:ensure` in front of it.
//
// `scripts/lib/spec-plan.ts` decides all of that and is asserted by a spec; this file runs what it returns.
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { ENSURE_LABEL, packageOf, planChanged, planTargets } from './lib/spec-plan.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

// Targets first, then flags: everything from the first `-` onward goes to vitest verbatim. Splitting on the
// first flag rather than filtering by prefix is what makes a flag's *value* its own — `-t "a case"`,
// `--changed HEAD~1`, `--bail 1` — without this having to know which flags take one.
const args = process.argv.slice(2);
const firstFlag = args.findIndex((a) => a.startsWith('-'));
const targets = firstFlag === -1 ? args : args.slice(0, firstFlag);
const flags = firstFlag === -1 ? [] : args.slice(firstFlag);

/** What git reports as changed, by package; a path in no package is covered by the root run's graph */
function changed(): { packages: string[]; anything: boolean } {
  const out = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf-8' }).stdout ?? '';
  const paths = out.split('\n').filter(Boolean).map((l) => l.slice(3).trim().split(' -> ').pop()!);
  return { packages: [...new Set(paths.map(packageOf))].filter((p) => p !== null), anything: paths.length > 0 };
}

if (targets.length === 0 && !changed().anything) {
  console.log('Nothing changed, and no spec named — nothing to run.');
  process.exit(0);
}

const { runs, unmatched, ambiguous } = targets.length > 0
  ? planTargets(targets, flags, ROOT)
  : planChanged(changed().packages, flags, ROOT);

if (unmatched.length > 0) {
  console.error(`No spec or file matches ${unmatched.map((t) => `"${t}"`).join(', ')}`);
  process.exit(1);
}

// A name wide enough to be a search is answered with the paths, not by running them: the one to run is a copy away,
// and running two dozen across eight suites because a word was short is not the narrowest thing that could fail.
if (ambiguous.length > 0) {
  for (const { query, specs } of ambiguous) {
    console.error(`"${query}" matches ${specs.length} specs across ${new Set(specs.map((f) => packageOf(path.relative(ROOT, f)))).size} suites:\n`);
    for (const f of specs) console.error(`  ${path.relative(ROOT, f)}`);
    console.error(`\nRun one, or several:\n  npm run spec -- ${path.relative(ROOT, specs[0])}`);
  }
  process.exit(2);
}

let failed = 0;
for (const run of runs) {
  if (run.label !== ENSURE_LABEL) console.log(`\n→ ${run.label}`);
  const result = spawnSync(run.command, [...run.args], { cwd: run.cwd, stdio: 'inherit' });
  if ((result.status ?? 1) !== 0) failed++;
  if (run.note !== undefined) console.log(`   ${run.note}`);
}
process.exit(failed === 0 ? 0 : 1);
