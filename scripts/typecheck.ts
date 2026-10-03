#!/usr/bin/env node
/**
 * `npm run typecheck`: every cheap static check, run concurrently.
 *
 *   npm run typecheck              # all of it
 *   npm run typecheck -- --cores 1 # one at a time, for a measurement or a confusing failure
 *
 * WHY THIS IS NOT AN `&&` CHAIN ANY MORE
 *
 * It was one, and every leg is a single-threaded compiler, so the step used one core for half a minute while
 * nine sat idle. Measured 2026-09-27 on a 10-core machine: **29.3s one at a time, 10.8s all at once**. Inside
 * the chain it was worse than either — 63.4s — because the rest of the chain saturated the cores it was not
 * using and starved the one it was.
 *
 * That corrected a claim in `chain.ts`'s header, which argued against running the steps together on the
 * grounds that "every step already uses all the cores". The largest app-free step did not, and the chain
 * admits on what each step takes now rather than counting them.
 *
 * WHAT THIS OWES THE CHECKS THAT READ IT
 *
 * **Each leg's command is spelled out as a command**, not assembled from its name. Two checks read this file's
 * text rather than running it, both through `reachableText` (`lib/npm-scripts.ts`), which matches
 * `npm run <name>`: `check:tiers` scans a step for the ways this repo launches the app, and
 * `chain-inputs.spec.ts` asks whether anything in the chain runs a given `<artifact>:check` — `schema:check`
 * and `exports:check` are reachable *only* through this file. A name in a template literal would be invisible
 * to both, and the second would report them as never run.
 */
import { boundedSpawn, budgetFor } from './lib/bounded-spawn.ts';
import { schedule } from './lib/chain-schedule.ts';
import { box } from './lib/core-budget.ts';
import { pruneDepFiles } from './lib/dep-files.ts';
import { asCount, parseFlags } from './lib/measure.ts';
import { ENSURE, TYPECHECK_LEGS } from './lib/typecheck-legs.ts';

/**
 * What of the machine the legs may take: all of it, because nothing else is running.
 *
 * Every leg is one `tsc`, so each weighs one core and a budget of ten runs ten of them — which is why
 * this shares the chain's scheduler and its one unit rather than counting legs of its own.
 *
 * **This command is not in the chain any more.** Each leg is its own chain step, so the chain's scheduler
 * owns the whole machine and this runs only when a person runs it directly, where there is nothing to
 * share with. The bound it used to carry was half the cores, "because the chain runs two other lanes
 * beside this step": a guess about a scheduler it could not observe, and the two-schedulers problem
 * `docs/archive/plans/test-unit-scheduling.md` removed for the unit suites and left here. It cost a
 * measured 63.4s in-chain against 29.3s of work, because the rest of the chain saturated the cores it was
 * not using and starved the one it was.
 *
 * Measured 2026-09-27 on ten cores, run alone, the step is flat from four at a time up — 12.9s at 3,
 * 11.2s at 4, 10.6s at 6, 11.5s at 8, 11.2s at 16 — because one leg, `typecheck:fe`, is most of the
 * floor. So the exact number above four buys nothing, and taking all of them costs nothing now that
 * nothing else wants any.
 *
 * `box()` rather than `os.cpus().length`, which counts the host's cores where this reads a container's
 * quota — `core-budget.ts` has the reasoning, and this was the last place in the repo getting it wrong.
 */
const budgetFrom = (cores: string | undefined): number =>
  asCount(cores, 'cores') ?? Math.min(TYPECHECK_LEGS.length, Math.max(2, box()));

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

interface Outcome { readonly ms: number; readonly code: number; readonly output: string; readonly timedOut?: true }

const done = new Map<string, Outcome>();

// The compilers below write a dep file each, and nothing removes one when its tsconfig goes. Pruned here
// rather than anywhere else because this is what drives them, and before the legs run rather than after, so
// no leg can have a file taken mid-write (`pruneOrphanDepFiles`, scripts/lib/dep-files.ts).
const pruned = pruneDepFiles();
if (pruned.length > 0) console.log(`Removed ${pruned.length} dep file(s) no tsconfig declares: ${pruned.join(', ')}`);

const result = await schedule({
  // One ordering rule, stated once: everything else reads what `packages:ensure` builds. It used to be a
  // `needs: [ENSURE]` on all seventeen legs — a hand-written edge beside a fact, which is what the chain
  // stopped keeping. The chain derives its own from `PACKAGE_BUILD_OUTPUTS`; this runner has one graph
  // and no inputs to derive from, so it says the rule instead of repeating it.
  steps: TYPECHECK_LEGS.map((leg) => ({ ...leg, dependsOn: leg.name === ENSURE ? [] : [ENSURE] })),
  budget: budgetFrom(parseFlags(process.argv.slice(2), { values: ['cores'], booleans: [] }).values.cores),
  skip: () => false,
  async run(leg) {
    const [command, ...args] = leg.command.split(' ');
    const outcome = await boundedSpawn(command!, args, budgetFor(leg.seconds));
    done.set(leg.name, outcome);
    // One line as it finishes, so a ten-second command is not ten seconds of silence. Completion order, since
    // that is what progress *is*; the failures below are in declared order, which is what reading wants.
    process.stdout.write(`  ${outcome.code === 0 ? 'ok  ' : 'FAIL'} ${leg.name.padEnd(18)} ${secs(outcome.ms)}\n`);
    return outcome.code === 0;
  },
});

const failed = TYPECHECK_LEGS.filter((leg) => (done.get(leg.name)?.code ?? 0) !== 0);
for (const leg of failed) {
  const outcome = done.get(leg.name)!;
  process.stderr.write(`\n${'─'.repeat(72)}\n${leg.name}${outcome.timedOut === true
    ? ` timed out: it exceeded its ${secs(budgetFor(leg.seconds))} budget and its process group was killed. It costs ${leg.seconds}s healthy, so either it is wedged or it has grown and the measurement in scripts/typecheck.ts is stale.`
    : ` failed (exit ${outcome.code})`}\n${'─'.repeat(72)}\n${outcome.output}\n`);
}

// A leg that threw is a bug in this runner rather than a failing check, so it is reported separately
for (const { step, error } of result.threw) {
  process.stderr.write(`\n${step}: the runner threw — ${error instanceof Error ? error.message : String(error)}\n`);
}

if (failed.length > 0 || result.threw.length > 0) {
  const names = failed.map((leg) => leg.name).join(', ');
  process.stderr.write(`\n❌ ${failed.length} of ${TYPECHECK_LEGS.length} failed: ${names}\n`);
  process.exitCode = 1;
} else if (result.skipped.length + result.started.length < TYPECHECK_LEGS.length) {
  // Dispatch stops after a failure, so this only reads as a scheduler bug
  process.stderr.write(`\n❌ only ${result.started.length} of ${TYPECHECK_LEGS.length} ran, and none failed\n`);
  process.exitCode = 1;
} else {
  console.log('✅ All type checks passed!');
}
