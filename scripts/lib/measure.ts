/**
 * What a timing run decides: whether the machine is quiet enough to measure on, what a series of samples
 * says, and how a number should be quoted. Pure, apart from `idleNow`, which is here rather than in either
 * command because two of them need it and a second copy would be a second sampling method.
 *
 * The definition, not the command — `scripts/measure.ts` is the command over it, the same split as
 * `scripts/test-unit-pool.ts` over `scripts/lib/unit-pool.ts`. Separate so a spec can assert the arithmetic
 * and the refusals without timing anything, which is the only way a decision like *"this run was too busy
 * to believe"* stays true.
 *
 * **Why this exists.** Five numbers in `goal-integration-pool` were wrong and three reached commit
 * messages: file-time quoted as wall time, a baseline measured while another agent's suite shared the box,
 * a 71s→46s improvement that was really 49.1s→48.2s, a prediction never measured at all, and a spec cost
 * recorded at load 71. Every one came from a hand-rolled `date +%s` loop with no idle gate and no
 * repetition. The doctrine was already written down; the tool was not, so each measurement re-invented the
 * method and re-invented the mistake.
 *
 * **Why it reads `os.cpus()` rather than anything else.** Both gates written during that session were
 * broken, and both in ways this avoids. One parsed `top -l` output and read the word `idle` instead of the
 * number before it, reporting 0% forever. The other matched process names, and matched idle editor language
 * servers that live for hours at 0% CPU and never exit, so it could never have opened. Cumulative CPU
 * counters are numbers already, from an API that cannot be renamed out from under the reader.
 *
 * Load average is deliberately not used: measured 2026-09-29, `os.loadavg()[0]` read 3.20 on a box that was
 * 78.7% idle. It lags by design, and waiting on it is waiting on the wrong thing.
 */

import * as os from 'node:os';

/** Cumulative CPU time, summed across cores: what two snapshots are diffed to get a utilisation. */
export interface CpuTimes {
  readonly idle: number;
  readonly total: number;
}

/** `os.cpus()`, reduced. Takes the array so a spec can hand it one rather than owning a machine. */
export const cpuTimes = (cpus: readonly { readonly times: Readonly<Record<string, number>> }[]): CpuTimes => {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const [field, ms] of Object.entries(cpu.times)) {
      total += ms;
      if (field === 'idle') idle += ms;
    }
  }
  return { idle, total };
};

/**
 * The idle fraction between two snapshots, 0 to 1.
 *
 * **Throws when no time elapsed, rather than returning zero.** A sample that cannot be read is a broken
 * measurement, not a busy machine, and the difference matters: the `top` parse this replaces returned 0%
 * for an unreadable line, so a gate waiting for the box to go quiet waited forever and looked like patience.
 * Loud beats stuck.
 */
export function idleFrom(before: CpuTimes, after: CpuTimes): number {
  const total = after.total - before.total;
  const idle = after.idle - before.idle;
  if (total <= 0 || idle < 0) {
    throw new Error(`CPU counters did not advance between samples (total ${total}ms, idle ${idle}ms) — `
      + 'the reading is broken, not low. Widen the sample or check the platform.');
  }
  return idle / total;
}

/** How long to sample for. Long enough to be stable, short enough that a gate loop is responsive. */
export const SAMPLE_MS = 250;

/**
 * How idle the machine must be before a timing is worth taking.
 *
 * Chosen from what actually went wrong rather than from a round number. The measurement that had to be
 * reverted was taken at roughly 0% idle, with another agent's full test suite on the box. The ones worth
 * quoting were taken at 90%. In between, 78.7% idle on this 10-core machine was about two cores of ordinary
 * desktop noise — editor, indexer — which did not visibly move a back-to-back comparison.
 *
 * So the floor is set to refuse "another suite is running" without refusing "an editor is open". A stricter
 * floor would be more correct per-measurement and would be routed around with `--force`, which is worse
 * than a floor that holds: the point is that the number in a commit message was taken on a quiet box, and a
 * gate nobody respects does not deliver that.
 */
export const IDLE_FLOOR = 0.7;

/** Whether to refuse a measurement outright. `--force` is the deliberate override, and the citation says so. */
export const refusesAsBusy = (input: { readonly idle: number; readonly floor: number; readonly force: boolean }):
boolean => !input.force && input.idle < input.floor;

/**
 * Whether conditions moved under a series that was allowed to start.
 *
 * Separate from the refusal, and reported rather than fatal: a run that starts quiet and ends busy has
 * produced numbers, and hiding that inside a clean-looking median is how a contended arm gets compared
 * against a quiet one. That comparison is exactly what made "71s → 46.1s" out of "49.1s → 48.2s".
 */
export const driftedDuring = (samples: readonly number[], floor: number): boolean =>
  samples.some((idle) => idle < floor);

export interface Summary {
  readonly runs: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
}

/** The middle of a sorted series; the mean of the two middles when there is no single one. */
export function summarise(samples: readonly number[]): Summary {
  if (samples.length === 0) throw new Error('nothing to summarise: a series with no samples is not a measurement');
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    runs: sorted.length,
    median: sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2,
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

/**
 * The order an A/B comparison runs in: interleaved, never blocked.
 *
 * Measured blocked, the last comparison ran three of A and then three of B, and a box that drifts between
 * the blocks puts the drift straight into the answer — which is what happened. Alternating makes each pair
 * share its conditions, so `pairedDelta` below compares like with like.
 */
export const runOrder = (runs: number, hasB: boolean): ('a' | 'b')[] =>
  Array.from({ length: runs }, () => (hasB ? ['a', 'b'] as const : ['a'] as const)).flat();

/**
 * The difference between two arms, paired.
 *
 * The median of the per-pair differences, not the difference of the two medians: pairing is the whole
 * reason for interleaving, and taking two independent medians would throw it away.
 */
export function pairedDelta(a: readonly number[], b: readonly number[]): { readonly ms: number; readonly fraction: number } {
  if (a.length !== b.length) throw new Error(`paired arms must have equal runs, got ${a.length} and ${b.length}`);
  return {
    ms: summarise(a.map((sample, i) => b[i]! - sample)).median,
    fraction: summarise(a.map((sample, i) => (b[i]! - sample) / sample)).median,
  };
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;

/**
 * One line a commit message can quote, carrying the conditions the number was taken under.
 *
 * A number without its conditions is an assertion; with them it is a citation, and the difference is three
 * of this repo's commit messages. Printed and never recorded: a timings file would be a *sample*, and
 * `spec-cost.json` is what that costs — hysteresis, a band and a contention refusal before it can be
 * trusted, for a question asked far more often than this one.
 */
export function citation(input: {
  readonly summary: Summary;
  readonly idle: number;
  readonly on: string;
  readonly forced: boolean;
  readonly drifted: boolean;
}): string {
  const range = input.summary.min === input.summary.max ? '' : ` (${seconds(input.summary.min)}-${seconds(input.summary.max)})`;
  const caveats = [input.forced ? 'forced' : '', input.drifted ? 'conditions drifted mid-series' : ''].filter(Boolean);
  return `${seconds(input.summary.median)} median of ${input.summary.runs}${range}, `
    + `${percent(input.idle)} idle, ${input.on}${caveats.length > 0 ? ` — ${caveats.join(', ')}` : ''}`;
}

/**
 * How idle this machine is, right now: two snapshots `SAMPLE_MS` apart.
 *
 * The one impure function here, and blocking on purpose — if anything else were running, the answer it
 * returns is the reason not to proceed.
 */
export function idleNow(): number {
  const before = cpuTimes(os.cpus());
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, SAMPLE_MS);
  return idleFrom(before, cpuTimes(os.cpus()));
}
