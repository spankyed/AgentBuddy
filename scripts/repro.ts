// `npm run check:repro` — build everything twice from one input and report any output whose bytes moved.
//
// Why it exists: `docs/archive/goals/goal-reproducible-builds.md`. default-setup's runtime bundle was measured
// producing four hashes from four builds (2026-09-25), and measured producing one from fourteen (2026-09-28)
// with nothing changed in between — no code, no dependency. That fits a timing-dependent race, so the
// evidence says "not manifesting today", not "fixed". This is what notices if it comes back, and it is the
// first thing here that has ever asked the question of *every* built output rather than the one file someone
// hashed by hand.
//
// **A diagnostic instrument, not a gate — and that is the settled answer, not a pending one.**
//
// Everything it compares (`BUILD_UNITS` outputs, `PACK_OUTPUTS`) is declared as a chain input, so the chain's
// own `freshnessSweep` already watches all of it: after every run it reports a step that passed and is stale
// again, naming the files that moved. That detector fires on every chain run; this one fires when someone
// types it. So having no caller is right rather than unfinished, and an earlier version of this comment
// treating it as a gate-in-waiting was wrong.
//
// What it does that the sweep cannot is ask the question *systematically, in one run, per file*. It earned
// that once: the sweep had been firing on `PACK_OUTPUTS` for days and the diagnosis it produced blamed esbuild
// and named only the runtime bundle, while this found three files and the actual cause (tsc's union ordering).
// An incidental signal told us something was wrong; this told us what.
//
// So reach for it when diagnosing, not to widen its coverage speculatively. `APP_OUTPUTS` is the worked
// example: measured 2026-09-28, three builds of the app produced byte-identical `renderer`, `api`, `main` and
// `preload` trees, and adding them would cost +26.2s per round (+52s, roughly doubling this) to place a second
// detector on ground the sweep already covers. Point this at them when app-build waste is what you are chasing
// — by editing the population for that run — rather than carrying the cost for a problem nobody has.
//
//   npm run check:repro                 # when a bundler moved, or a step keeps going stale after it passed
//   npm run check:repro 2>&1 | tail -20 # the verdict without the build logs
//
// It rebuilds this checkout's outputs and takes the package-build lock, so against a running chain it fails at
// once rather than racing it. Treat its absence from a green chain as saying nothing: the sweep is what speaks
// on every run.
//
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from '@apack/host/build/packages-built';
import { compare, KNOWN_IRREPRODUCIBLE, partition, reproPaths, snapshot } from './lib/repro.ts';

/**
 * One full build of everything the comparison covers.
 *
 * `generate-entries --force` is here rather than left to `apack build`, and that is the point of the
 * function: `apack build` calls `generateEntries([])` with no `--force`, which skips on a matching
 * `.inputs-hash`. Without this line the second round would re-hash codegen output it never regenerated and
 * report it identical — half the population passing for having been looked at, which is the failure this
 * whole check exists to catch. `repro.spec.ts` asserts the flag is still here.
 */
function buildEverything(round: number): void {
  const run = (command: string, args: string[]): void => {
    process.stdout.write(`\n[check:repro] round ${round}: ${command} ${args.join(' ')}\n`);
    execFileSync(command, args, { cwd: REPO_ROOT, stdio: 'inherit' });
  };
  run('npm', ['run', 'packages:build']);
  run('npm', ['run', 'generate:entries', '-w', '@app/default-setup', '--', '--force']);
  run('npm', ['run', 'build', '-w', '@app/default-setup']);
}

const paths = reproPaths();
process.stdout.write(`[check:repro] comparing ${paths.length} output trees across two builds\n`);

buildEverything(1);
const before = snapshot(paths);
buildEverything(2);
const after = snapshot(paths);

if (before.size === 0) {
  process.stderr.write('\n❌ the first build produced no files under any of the derived output paths, so there '
    + 'was nothing to compare. Check that `npm run packages:build` and default-setup\'s build actually ran.\n');
  process.exit(1);
}

const { failing, known } = partition(compare(before, after));

// Printed whether or not one fired: these are races, so a run where a recorded output happens to agree is
// not evidence it is fixed, and a silent pass would let the reader believe the tree is reproducible when it
// is not. With nothing recorded there is nothing to caveat, so it says so in one line.
const recorded = Object.keys(KNOWN_IRREPRODUCIBLE).sort();
if (recorded.length === 0) {
  process.stdout.write('\nno outputs are recorded as irreproducible, so every difference below is a failure\n');
} else {
  process.stdout.write(`\n${recorded.length} outputs are recorded as irreproducible; ${known.length} differed this run:\n`);
  for (const path of recorded) {
    process.stdout.write(`  ${known.some((d) => d.path === path) ? 'differed' : 'agreed  '}  ${path}\n    ${KNOWN_IRREPRODUCIBLE[path]}\n`);
  }
}

if (failing.length === 0) {
  const caveat = known.length === 0 ? '' : `, bar the ${known.length} recorded above`;
  process.stdout.write(`\n✅ ${before.size - known.length} of ${before.size} built files are identical across two `
    + `builds of the same input${caveat}\n`);
} else {
  process.stderr.write(`\n❌ ${failing.length} of ${before.size} built files did not survive a second build `
    + 'of the same input, and no recorded cause explains them:\n');
  for (const { path, kind } of failing) process.stderr.write(`  ${kind.padEnd(12)} ${path}\n`);
  process.stderr.write('\nA build output that changes without its input is one the chain caches on and cannot '
    + 'trust: every step declaring it goes stale once per build. Find the cause before recording one in '
    + 'KNOWN_IRREPRODUCIBLE. See docs/goals/goal-reproducible-builds.md.\n');
  process.exit(1);
}
