/**
 * Whether this machine is quiet enough to measure on: `npm run check:idle`.
 *
 * **Three commands refuse a measurement below `IDLE_FLOOR` and none of them could be asked in advance.**
 * `spec-cost:update` refuses before it runs anything, `npm run measure` refuses before its first run, and
 * `chain --record` refuses *after* the run — so the way to learn the answer was to spend 200 seconds and be
 * told no. That happened twice on 2026-10-04, which is what this is for.
 *
 * Exits non-zero below the floor, so it composes with the thing it is a pre-flight for:
 *
 *     npm run check:idle && npm run chain -- --all --record --forget --step test:unit:host
 *
 * **It answers "is it worth starting", not "will this be clean".** A reading is of this instant; the command
 * it gates may run for minutes, and a long one is its own load — the chain reads 83% before a run that ends
 * under the floor. `measure.ts` makes the same point from the other side: *"Idle is sampled between runs,
 * never during one: a reading taken while the command runs measures the command."* So the late refusals stay
 * where they are, and this is the cheap half.
 *
 * In the `check:*` family by shape as well as by name: it reports a condition and exits non-zero on a hit.
 * Unlike the others it is not a chain step and must not become one — the chain is its own load, so a gate on
 * the chain's own idleness would fail on the work it was asked to do.
 */
import { IDLE_FLOOR, idleNow } from './lib/measure.ts';

const idle = idleNow();
const asPercent = (share: number): string => `${Math.round(share * 100)}%`;
const quiet = idle >= IDLE_FLOOR;

process.stdout.write(`${asPercent(idle)} idle, floor ${asPercent(IDLE_FLOOR)} — `
  + `${quiet ? 'quiet enough to measure on' : 'too busy to measure on'}\n`);
if (!quiet) {
  process.stdout.write('  A measurement taken now would be of the machine. `npm run measure`,\n'
    + '  `spec-cost:update` and `chain --record` all refuse below this floor.\n');
}
// Not process.exit(): stdout may still have buffered output, which is the rule `orchestrator-exit.spec.ts`
// holds for every script here that writes before it ends
process.exitCode = quiet ? 0 : 1;
