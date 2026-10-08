/**
 * Whether this machine is quiet enough to measure on: `npm run check:idle`.
 *
 * **The command it gates refuses before it runs anything, and that refusal costs a round trip.**
 * `npm run measure` and `npm run measure:loop` both check `IDLE_FLOOR` and stop; asking first is cheaper
 * than starting a five-run A/B and being told no. One floor, because there is one kind of answer left:
 * every command that asks prints its reading and records nothing (`measure.ts`'s `IDLE_FLOOR` says why).
 *
 * Exits non-zero below the floor, so it composes with what it is a pre-flight for:
 *
 *     npm run check:idle && npm run measure -- --runs 3 "npm run compile"
 *
 * **It answers "is it worth starting", not "will this be clean".** A reading is of this instant; the
 * command it gates may run for minutes, and a long one is its own load — a chain run reads 83% before
 * ending under the floor. `measure.ts` makes the same point from the other side: *"Idle is sampled between
 * runs, never during one: a reading taken while the command runs measures the command."* So the late
 * refusal stays where it is, and this is the cheap half.
 *
 * In the `check:*` family by shape as well as by name: it reports a condition and exits non-zero on a hit.
 * Unlike the others it is not a chain step and must not become one — the chain is its own load, so a gate
 * on the chain's own idleness would fail on the work it was asked to do.
 */
import { IDLE_FLOOR, idleNow } from './lib/measure.ts';

const idle = idleNow();
const asPercent = (share: number): string => `${Math.round(share * 100)}%`;
const quiet = idle >= IDLE_FLOOR;

process.stdout.write(`${asPercent(idle)} idle — ${quiet ? 'quiet enough to measure on' : 'too busy to measure on'}\n`);
process.stdout.write(`  measuring needs ${asPercent(IDLE_FLOOR)} (measure, measure:loop)\n`);
// **The caveat belongs in the output, not only in the doc above.** A verdict shaped like a promise is what
// talks a reader past the floor: observed 2026-10-07, this printed 84% moments after a chain run.
process.stdout.write('  A reading of this instant, and a long command is its own load: this says whether to '
  + 'start,\n  not whether the run will be clean. The late refusal is what catches a run disturbed while it '
  + 'ran.\n');
// Not process.exit(): stdout may still have buffered output, which is the rule `orchestrator-exit.spec.ts`
// holds for every script here that writes before it ends
process.exitCode = quiet ? 0 : 1;
