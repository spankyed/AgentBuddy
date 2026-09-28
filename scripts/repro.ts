// `npm run check:repro` — build everything twice from one input and report any output whose bytes moved.
//
// Why it exists: `docs/archive/goals/goal-reproducible-builds.md`. default-setup's runtime bundle was measured
// producing four hashes from four builds (2026-09-25), and measured producing one from fourteen (2026-09-28)
// with nothing changed in between — no code, no dependency. That fits a timing-dependent race, so the
// evidence says "not manifesting today", not "fixed". This is what notices if it comes back, and it is the
// first thing here that has ever asked the question of *every* built output rather than the one file someone
// hashed by hand.
//
// **Provisional: nothing runs this.** It is not a chain step, deliberately — two full builds (54.7s measured
// 2026-09-28) against a chain that is 27s warm, which is the same trade `api:check` makes and the same
// answer. But unlike `api:check`, which `typecheck` covers with a 0.6s `api:stamp` proxy and which the
// publish path runs, this has no caller at all. So it reports only when someone types it, and a check nobody
// invokes reports nothing. Treat its absence from a green chain as meaning nothing about reproducibility.
//
// Whether it earns a caller is open. The shapes on the table, none chosen:
//   - a `prerelease` hook, beside the other checks that guard what gets published;
//   - run when a bundler moves — an esbuild, vite, tsup or tsx bump — which is when the answer can change;
//   - deleted, keeping the measurement in docs/archive/goals/goal-reproducible-builds.md, if the honest
//     answer turns out to be that nobody will run it.
//
// Until then, by hand:
//
//   npm run check:repro                 # after a bundler bump, or before cutting a release
//   npm run check:repro 2>&1 | tail -20 # the recorded exceptions and the verdict, without the build logs
//
// Expect it to rebuild this checkout's outputs, which costs the next `npm run chain` one cycle of cache
// invalidation, and to take the package-build lock — so against a running chain it fails at once rather than
// racing it.
//
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { compare, KNOWN_IRREPRODUCIBLE, partition, reproPaths, snapshot } from './lib/repro.ts';

/**
 * One full build of everything the comparison covers.
 *
 * `generate-entries --force` is here rather than left to `abuddy build`, and that is the point of the
 * function: `abuddy build` calls `generateEntries([])` with no `--force`, which skips on a matching
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
