// `npm run check:repro` — build everything twice from one input and report any output whose bytes moved.
//
// Why it exists: `docs/goals/goal-reproducible-builds.md`. default-setup's runtime bundle was measured
// producing four hashes from four builds (2026-09-25), and measured producing one from fourteen (2026-09-28)
// with nothing changed in between — no code, no dependency. That fits a timing-dependent race, so the
// evidence says "not manifesting today", not "fixed". This is what notices if it comes back, and it is the
// first thing here that has ever asked the question of *every* built output rather than the one file someone
// hashed by hand.
//
// Not a chain step, deliberately: it is two full builds against a chain that is 27s warm. `api:check` is the
// same trade and the same answer. Run it before a release, and when a bundler moves.
//
// It takes the repo's package-build lock, with a `command` intent, so against a running chain it fails at
// once rather than racing it. And it does rebuild this checkout's outputs, which costs the next chain run one
// cycle of cache invalidation.
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

// Printed whether or not it fired: these are races, so a run where one happens to agree is not evidence it is
// fixed, and a silent pass would let the reader believe the tree is reproducible when it is not.
process.stdout.write(`\n${Object.keys(KNOWN_IRREPRODUCIBLE).length} outputs are recorded as irreproducible `
  + `(tsc declaration emit); ${known.length} of them differed this run:\n`);
for (const path of Object.keys(KNOWN_IRREPRODUCIBLE).sort()) {
  const differed = known.some((d) => d.path === path);
  process.stdout.write(`  ${differed ? 'differed' : 'agreed  '}  ${path}\n    ${KNOWN_IRREPRODUCIBLE[path]}\n`);
}

if (failing.length === 0) {
  process.stdout.write(`\n✅ ${before.size - known.length} of ${before.size} built files are identical across two `
    + 'builds of the same input, and the rest are the recorded ones above\n');
} else {
  process.stderr.write(`\n❌ ${failing.length} of ${before.size} built files did not survive a second build `
    + 'of the same input, and no recorded cause explains them:\n');
  for (const { path, kind } of failing) process.stderr.write(`  ${kind.padEnd(12)} ${path}\n`);
  process.stderr.write('\nA build output that changes without its input is one the chain caches on and cannot '
    + 'trust: every step declaring it goes stale once per build. Find the cause before recording one in '
    + 'KNOWN_IRREPRODUCIBLE. See docs/goals/goal-reproducible-builds.md.\n');
  process.exit(1);
}
