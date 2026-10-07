// How much a pool step loses when the box gives it fewer workers — the `stretches` a rung or a step declares.
//
// **It exists because the recipe was four steps of hand-assembly over facts the repo already holds.** The
// command is `measureCommandFor`, this box's width is `coresFor`, the target width is that at
// `box() / SLOWER_MACHINE`, and the A/B is `measure --against`. Getting any of them wrong by hand produces a
// ratio that looks like an answer, and the one that matters most is the knob: a run where both arms used the
// same worker count reports ~1.0x, which reads as "this step does not stretch".
//
// So this derives all four and refuses rather than reporting a number it cannot stand behind.
import { execFileSync } from 'node:child_process';
import { box, coresFor, POOL_WIDTH, SLOWER_MACHINE } from './lib/core-budget.ts';
import { measureCommandFor } from './lib/unit-pool.ts';
import { exitOnEpipe } from './lib/exit-on-epipe.ts';

const USAGE = 'usage: npm run measure:stretch -- <step>   (a step that declares a POOL_WIDTH)';

/**
 * A pool's width is workers, so the knob is `--maxWorkers` and the arms differ only in it.
 *
 * Appended rather than substituted: `measureCommandFor` gives the pool's real command, and a flag added at
 * the end wins in vitest, so the measured command stays the one the chain runs.
 */
const withWorkers = (command: string, workers: number): string => `${command} --maxWorkers=${workers}`;

function main(): void {
  exitOnEpipe();
  const step = process.argv[2];
  if (step === undefined || step.startsWith('-')) {
    console.log(USAGE);
    process.exit(step === undefined ? 1 : 0);
  }

  // **Refused, not defaulted.** Without a declared width the step is serial work, where the unit is CPU
  // share and no flag fakes it — the honest answer is a smaller machine, which each rung's `until` names.
  // `sizeOf`'s rule: a confident wrong answer is the permissive one.
  if (POOL_WIDTH[step] === undefined) {
    console.error(`${step} declares no POOL_WIDTH, so its work is not sensitive to a worker count and this `
      + 'cannot measure it. Serial work stretches by CPU share: run it on a smaller machine, which is what '
      + "the rung's `until` asks for (scripts/lib/step-timeouts.ts).");
    process.exit(1);
  }

  const here = coresFor(step, box());
  const there = coresFor(step, Math.max(1, Math.round(box() / SLOWER_MACHINE)));
  if (here === there) {
    console.error(`${step} resolves to ${here} worker(s) both on this box and on one ${SLOWER_MACHINE}x `
      + 'smaller, so there is no loss here to measure and its stretch is 1.');
    process.exit(1);
  }

  const command = measureCommandFor(step);
  console.log(`${step}: ${here} workers here, ${there} on a box ${SLOWER_MACHINE}x smaller\n`);
  // `measure` owns the idle floor, the interleaving and the median — this only decides the two arms. The
  // ratio of its two medians is the figure; it prints both with their conditions, which is what a reader
  // pastes beside the declaration.
  execFileSync('npm', ['run', 'measure', '--',
    '--against', withWorkers(command, there), withWorkers(command, here)], { stdio: 'inherit' });
  console.log(`\n  stretches = the ${there}-worker median over the ${here}-worker one.`);
  console.log('  Check the two arms report the worker counts above: vitest names its own, and an A/B whose');
  console.log('  knob did not turn reports ~1.0x and reads as a step that does not stretch.');
}

main();
