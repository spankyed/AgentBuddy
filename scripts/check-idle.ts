/**
 * Whether this machine is quiet enough to measure on: `npm run check:idle`.
 *
 * **Three commands refuse a measurement when the box is busy and none of them could be asked in advance.**
 * `spec-cost:update` refuses before it runs anything, `npm run measure` refuses before its first run, and
 * `chain --record` refuses *after* the run — so the way to learn the answer was to spend 200 seconds and be
 * told no. That happened twice on 2026-10-04, which is what this is for.
 *
 * **Two floors, because what a command leaves behind decides how quiet it needs to be.** A printed timing
 * carries its own conditions and is gone; a recorded one outlives the reading, and measured on this box a
 * run admitted at `IDLE_FLOOR` drifts the body as far as the drift report's own threshold
 * (`RECORD_IDLE_FLOOR`'s table). So this reports both and exits on the stricter: it is a pre-flight for
 * `--record`, which is the composition below, and a reader who only wants to print is told they are clear.
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
import { IDLE_FLOOR, idleNow, RECORD_IDLE_FLOOR } from './lib/measure.ts';

const idle = idleNow();
const asPercent = (share: number): string => `${Math.round(share * 100)}%`;
const canPrint = idle >= IDLE_FLOOR;
const canRecord = idle >= RECORD_IDLE_FLOOR;

process.stdout.write(`${asPercent(idle)} idle — `
  + `${canRecord ? 'quiet enough to record on' : canPrint ? 'quiet enough to print a timing, not to record one' : 'too busy to measure on'}\n`);
process.stdout.write(`  recording needs ${asPercent(RECORD_IDLE_FLOOR)} (spec-cost:update, chain --record), `
  + `printing needs ${asPercent(IDLE_FLOOR)} (measure, measure:loop)\n`);
if (!canRecord) {
  process.stdout.write(`  What you would record now is the machine${canPrint ? ' — a printed timing is fine' : ''}.\n`);
}
// Not process.exit(): stdout may still have buffered output, which is the rule `orchestrator-exit.spec.ts`
// holds for every script here that writes before it ends
process.exitCode = canRecord ? 0 : 1;
