/**
 * What a timing run decides: whether the machine is quiet enough to measure on, what a series of samples
 * says, how a number should be quoted, and what its arguments mean. Mostly pure; the sampling and the
 * burners are here rather than in either command because two of them need each, and a second copy of
 * either is a second answer to one question.
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
import { boundedSpawn } from './bounded-spawn.ts';
import { box } from './core-budget.ts';

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
 * Average cores busy across a window — the box's, not one process's.
 *
 * **It exists so that an A/B's arms can be shown to differ in something other than wall time.** A null
 * result is ambiguous between "the change did nothing" and "the change never reached what you changed", and
 * wall time alone cannot separate them: measured 2026-10-04, `--maxWorkers 2` moved `test:integration` by
 * -1% because `poolOptions.maxThreads` takes precedence over it, and the arm that looked like a flat pool
 * was a pool still running at 6.6 cores. Capping the pool for real took 42.5s to 82.5s at a third of that.
 *
 * **Reported on `--against` and nowhere else.** On a lone measurement it sizes no choice, which is the bar a
 * figure has to clear here; between two arms it is the difference that says the treatment landed. Scope it
 * wider and every quoted citation in the repo gains a number its reader cannot act on.
 *
 * **The box, which is why `--busy` dominates it and a comparison survives that.** Burners and anything else
 * running are in the total, so the absolute value is not the command's CPU — but both arms carry the same
 * baseline, so the *difference* between them still answers the question this is here for.
 *
 * Not a verdict: nothing compares the two arms' values and warns. Most null results are real, so a gate
 * firing whenever both arms agree would be wrong more often than right and would train its reader to skip
 * it. The number is printed; reading it is the method's job (`npm run measure`'s entry in CLAUDE.md).
 */
export const coresBusy = (before: CpuTimes, after: CpuTimes, cores: number): number =>
  (1 - idleFrom(before, after)) * cores;

/**
 * How idle the machine must be before a timing is worth **printing**.
 *
 * Chosen from what actually went wrong rather than from a round number. The measurement that had to be
 * reverted was taken at roughly 0% idle, with another agent's full test suite on the box. The ones worth
 * quoting were taken at 90%. In between, 78.7% idle on this 10-core machine was about two cores of ordinary
 * desktop noise — editor, indexer — which did not visibly move a back-to-back comparison.
 *
 * So this floor refuses "another suite is running" without refusing "an editor is open". A stricter one
 * would be more correct per-measurement and would be routed around with `--force`, which is worse than a
 * floor that holds: the point is that the number in a commit message was taken on a quiet box, and a gate
 * nobody respects does not deliver that.
 *
 * **It is the floor for a command that prints and records nothing** — `npm run measure` and
 * `npm run measure:loop`, both of which also take `--idle` to move it per run, and whose output carries its
 * own conditions (`citation`). A command that writes a measurement into a committed artifact asks
 * `RECORD_IDLE_FLOOR` instead, because what it leaves behind outlives the reading.
 */
export const IDLE_FLOOR = 0.7;

/**
 * How idle the machine must be before a timing is worth **recording**.
 *
 * **Measured, which the printing floor above never was.** Induced load on this 10-core box, each row a run
 * of `@app/repo-checks`' fast half against a quiet reference, 2026-10-04:
 *
 * | load | idle | cores busy | body drift vs quiet | worst single spec |
 * |---|---|---|---|---|
 * | none | 93% | 0.7 | reference | — |
 * | none | 94% | 0.6 | -7% | 74% |
 * | 1 burner | 81% | 1.9 | +4% | 86% |
 * | 2 burners | 76% | 2.4 | **+15%** | 150% |
 * | 3 burners | 67% | 3.3 | +16% | 250% |
 * | 5 burners | 36% | 6.4 | +43% | 250% |
 *
 * The line that sets it: **a floor that admits runs its own drift gate would flag is not a floor.** The
 * crossover is near 77% and 76% gave +15%, which is `DRIFT_SHARE` exactly; at 81% the drift is +4%, inside
 * the -7% that two quiet runs differ by on their own. So the floor has to sit above 77%, and 80% is the
 * lowest round figure that does — a run admitted here is expected to drift about 5% against a gate that
 * fires at 15%, so the property holds.
 *
 * **It was 85% until 2026-10-05, and the margin was the thing that moved.** 85 was this same table read as
 * "the lowest round figure whose expected drift sits inside quiet-run variance, *with margin for a box
 * noisier than the one measured*". The margin cost more than it bought: on the box the table was measured
 * on, readings sat at 82-85% for about fifteen minutes with nothing else obviously running, which refused a
 * legitimate 415-row re-record that had a defect waiting on it. A floor nobody can reach is a floor that
 * gets `--force`d, which is worse than one set where the data says it belongs. The margin is gone; the
 * measured basis is not.
 *
 * **What still catches a run this admits**, which is why dropping the margin is not the only protection:
 * `refusesAsContended` asks *after* measuring whether too much of the body moved to have been measuring the
 * code, and it is on for both callers. `chain --record` additionally reports body drift (`driftVerdict`).
 * `spec-cost:update` no longer does — that report was removed on 2026-10-05 for a reason of its own — so
 * for spec costs the post-hoc contention check is the whole of it. If that check is ever weakened, this
 * number is the one to put back.
 *
 * **Not 90%**, for `IDLE_FLOOR`'s reason: readings of 86-95% came easily on that box and 78% came up
 * repeatedly, so 90% is the value that gets `--force`d. And not a per-spec bound, because there is no such
 * thing to have — one quiet run moves a single spec 74% against another, which is why the record keeps a
 * window.
 *
 * **This floor guards the body, and nothing else asks it to guard a half.** A reading that would place a
 * spec in the other half cannot become the answer on its own — `spec-cost.ts`'s `WINDOW` keeps more than
 * one and takes the median, so one reading is kept and outvoted. That is a property of the mechanism and
 * needs no sample, which is the reason it is stated this way: the first version of this paragraph said "no
 * run above 36% idle moved a spec across an edge in that sweep", which was one run per load level and so
 * bounds the crossing rate at 95% (`upperBound`). It read as the reason while the median was the reason,
 * and it sized no choice — the floor is set by the drift above, which would be 85% whatever the crossing
 * rate turned out to be. Deleted rather than re-measured for that second reason.
 *
 * **The relationship to `DRIFT_SHARE` is empirical and no case asserts it**, which is deliberate: the two
 * are different quantities. `1 - 0.85` used to equal `DRIFT_SHARE` exactly and an assertion was written on
 * that before it was checked — the busy share of a box is not body drift, and the measured ratio between
 * them is about 0.6 to 1 (24% busy gave +15%). That coincidence is gone now, which is the clearest argument
 * it was one. A spec cannot re-take the measurement, so what `measure.spec.ts` holds is the ordering: a
 * recording floor stricter than the printing one. Re-measure the box and both numbers may move; that
 * ordering may not.
 */
export const RECORD_IDLE_FLOOR = 0.80;

/**
 * How far a re-measurement has to move before a record follows it, as a share of what is recorded.
 *
 * Hysteresis, and the reason for it is measured: treating a sample as a derivation churned 125 of 163
 * spec-cost entries between two idle runs while the answer they support changed zero times. A band wide
 * enough to absorb that leaves a record that moves when the code does and not when the machine does.
 *
 * The floor is the caller's, because the unit is: spec costs are milliseconds and chain steps are
 * seconds, and a floor is what keeps the fraction from chasing noise on a small number.
 */
export const SETTLED_FRACTION = 0.35;

/** Whether a measurement has moved past the band around what is recorded. An absent record always has. */
export const movedBeyondBand = (recorded: number | undefined, measured: number, floor: number): boolean =>
  recorded === undefined || Math.abs(measured - recorded) > Math.max(floor, SETTLED_FRACTION * recorded);

/**
 * How far a run's measurements moved as a body, against what is recorded for the same subjects.
 *
 * The one thing a per-entry tolerance cannot show. Random jitter does not bias a sum — the lags fall both
 * ways and cancel, which is why a spec suite's total moved 0.4%, 6.5% and 9.9% between idle runs while its
 * members moved 10-18% each. *Correlated* drift does: a bundler bump that adds a fifth to every entry stays
 * under every individual tolerance, so nothing re-records and anything reading the total is reading numbers
 * that are uniformly stale. A chain step's costs have the same exposure through `criticalPath`, which sums
 * them, and changing the chain's admission policy is exactly the shape that moves every one at once.
 *
 * Measured against the record rather than the settled values, since settling is where the drift went.
 * Undefined when nothing measured had a recorded value to move from — not zero, which would read as steady.
 */
export function bodyDrift(recorded: ReadonlyMap<string, number>, measured: ReadonlyMap<string, number>): number | undefined {
  const shared = [...measured.keys()].filter((name) => recorded.get(name) !== undefined);
  const before = shared.reduce((sum, name) => sum + recorded.get(name)!, 0);
  // Nothing measured had a value to drift from, which reads as steady if it comes back as zero
  if (before === 0) return undefined;
  return shared.reduce((sum, name) => sum + measured.get(name)!, 0) / before - 1;
}

/**
 * Above the drift a run of unchanged work shows: measured at 0.4%, 6.5% and 9.9% on an idle machine.
 *
 * **Inherited, and the subject it was measured on is no longer a consumer.** Those three figures are
 * `@app/repo-checks`' fast half — 46 specs, the largest 12% of the body — and the spec-cost records stopped
 * asking this question on 2026-10-05, because for most of them the premise behind it is false: five of the
 * twelve had one spec at 64% or more of their body, so there was nothing for that file's jitter to cancel
 * against. `scripts/spec-cost.ts` records that removal where the report used to be.
 *
 * What is left is the chain's table, which is less concentrated and not immune: ten steps declare a cost,
 * the largest is 34% of the total and the top three are 62%. That is why this is tolerable rather than
 * re-measured — `driftVerdict` asks the question twice, so the concentration the chain *does* have is
 * answered by dropping the largest mover rather than by the size of this number. What the threshold still
 * decides is when a **correlated** movement is reported, and a correlated movement is by construction not
 * one member's, which is the case these three figures do describe.
 *
 * Re-measure it against the chain if `driftVerdict`'s second reading is ever removed, or if the table gains
 * a step past about half the body, since the discrimination thins as one member approaches the whole.
 * Attempted 2026-10-05: two `npm run chain -- --all` runs came in at 151.7s and 151.2s, but the box read
 * 58-66% idle against `RECORD_IDLE_FLOOR`'s 85%, so they say the run is repeatable and nothing about drift.
 */
export const DRIFT_SHARE = 0.15;

/** Whether a run's body moved further than idle runs vary, in either direction */
export const drifted = (move: number | undefined): move is number =>
  move !== undefined && Math.abs(move) > DRIFT_SHARE;

/**
 * Which of two things a body movement is, because they want opposite remedies.
 *
 * `bodyDrift`'s premise is that jitter cancels in a sum, which holds while no member dominates. Where one
 * does, the sum is that member's reading and the report fires on its noise — measured 2026-10-05, five of
 * the twelve spec-cost records had a single spec at 64% or more of their body, which is why the spec half
 * of that report is gone. The chain's own table is less concentrated and not immune: ten steps declare a
 * cost, the largest (`test:packaged-authoring`) is 34% of the total and the top three are 62%.
 *
 * So the question is asked twice. A movement that survives leaving out the single largest mover is the
 * body's; one that does not is that member's, and naming it is both the finding and the remedy — a record
 * keyed by member can re-record one row without touching the rest.
 *
 * No new threshold: the second reading is `DRIFT_SHARE` applied to the same data `bodyDrift` already holds.
 */
export type DriftVerdict =
  /** Inside the band as a body — nothing to report */
  | { readonly kind: 'steady'; readonly share: number | undefined }
  /** The movement survives dropping the largest mover, so it is the body that moved */
  | { readonly kind: 'body'; readonly share: number }
  /** One member carries it: without that member the body is inside the band */
  | { readonly kind: 'member'; readonly share: number; readonly name: string; readonly without: number | undefined };

export function driftVerdict(
  recorded: ReadonlyMap<string, number>, measured: ReadonlyMap<string, number>,
): DriftVerdict {
  const share = bodyDrift(recorded, measured);
  if (!drifted(share)) return { kind: 'steady', share };

  const shared = [...measured.keys()].filter((name) => recorded.get(name) !== undefined);
  // The largest mover by absolute seconds, which is what moves a sum — not by its own share, which would
  // pick a tiny step that doubled over the one that actually carried the total
  const name = shared.reduce((worst, next) =>
    Math.abs(measured.get(next)! - recorded.get(next)!) > Math.abs(measured.get(worst)! - recorded.get(worst)!)
      ? next : worst);
  const without = bodyDrift(
    new Map([...recorded].filter(([key]) => key !== name)),
    new Map([...measured].filter(([key]) => key !== name)),
  );
  // `undefined` means that member was the only thing with a value to move from, so it is the whole movement
  return drifted(without) ? { kind: 'body', share } : { kind: 'member', share, name, without };
}

/**
 * The share of a record's entries that may move before the run is read as measuring the machine.
 *
 * This is the check a sample can have. A derivation's is equality and a proxy's is a self-check against the
 * real thing; neither is available here, and what is left is reproducibility. With the tolerance above, an
 * idle run moves 0-3% of a spec suite; a contended one moved 76%. The instruction to "run the update with
 * nothing else on the machine" was prose until this, and was ignored twice in one day.
 */
export const CONTENDED_SHARE = 0.25;

/**
 * Whether a run moved more of what it could move than a measurement should.
 *
 * `comparable` is the entries that had a value to move — measured minus added — so a record written for the
 * first time is never refused for having recorded everything.
 */
export const contended = (moved: number, comparable: number): boolean =>
  comparable > 0 && moved > CONTENDED_SHARE * comparable;

/**
 * Whether to refuse this run as a measurement of the machine rather than of the work.
 *
 * Three inputs, which is why it is named rather than spelled out at the call site. `--force` is the user
 * saying it really did change this much, and a record that did not exist has nothing to have moved.
 *
 * `--all` is not among them, and the arithmetic is why. A correlated drift of a fraction `f` moves an entry
 * only where `f * r > max(floor, SETTLED_FRACTION * r)`: above `floor / SETTLED_FRACTION` that needs
 * `f > SETTLED_FRACTION`, and below it needs `r > floor / f`, which cannot both hold. So the drift `--all`
 * exists to clear moves nothing but the few entries that cross the band, and this counts `moved` — it cannot
 * fire on that run. What it still fires on is a quarter of a record each past its own tolerance, which is a
 * loaded machine or a real regression, and `--force` is the answer to the second whichever flags it carries.
 */
export const refusesAsContended = (input: {
  readonly hasPrevious: boolean; readonly force: boolean;
  readonly moved: number; readonly comparable: number;
}): boolean => input.hasPrevious && !input.force && contended(input.moved, input.comparable);

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
 * What the box was doing while the run happened — one sentence, and the only place that decides it.
 *
 * It exists because there were two. The `— under N induced busy cores` marking lived in the timing
 * citation alone, so trials, the mode `--busy` was built for, never said the load was induced; the
 * session's own headline result was reported without it.
 *
 * **Under induced load the drift note is replaced rather than printed.** Drift means the conditions
 * changed *unexpectedly*, and `driftedDuring` cannot tell that from the load we asked for, so every
 * `--busy` run ended `— conditions drifted mid-series`. A warning that is always on is one nobody reads.
 * The idle range says the same thing honestly: whether the load held.
 */
export function conditions(input: {
  readonly idles: readonly number[];
  readonly floor: number;
  readonly busy: number;
  readonly forced: boolean;
}): string {
  if (input.idles.length === 0) throw new Error('conditions over no samples describe nothing');
  const low = Math.min(...input.idles);
  const high = Math.max(...input.idles);
  if (input.busy > 0) {
    const range = low === high ? percent(low) : `${percent(low)}-${percent(high)}`;
    return `under ${input.busy} induced busy cores, ${range} idle`;
  }
  const caveats = [
    input.forced ? 'forced' : '',
    driftedDuring(input.idles, input.floor) ? 'conditions drifted mid-series' : '',
  ].filter(Boolean);
  return `${percent(low)} idle${caveats.length > 0 ? ` — ${caveats.join(', ')}` : ''}`;
}

/**
 * One line a commit message can quote, carrying the conditions the number was taken under.
 *
 * A number without its conditions is an assertion; with them it is a citation, and the difference is three
 * of this repo's commit messages. Printed and never recorded: a timings file would be a *sample*, and
 * `spec-cost.json` is what that costs — hysteresis, a band and a contention refusal before it can be
 * trusted, for a question asked far more often than this one.
 */
export function citation(input: Parameters<typeof conditions>[0] & {
  readonly summary: Summary;
  readonly on: string;
}): string {
  const range = input.summary.min === input.summary.max ? '' : ` (${seconds(input.summary.min)}-${seconds(input.summary.max)})`;
  return `${seconds(input.summary.median)} median of ${input.summary.runs}${range}, ${conditions(input)}, ${input.on}`;
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

/** This instant's cumulative CPU counters — the open bracket of a `coresBusySince` window. */
export const cpuNow = (): CpuTimes => cpuTimes(os.cpus());

/**
 * `coresBusy` against this instant, over this box.
 *
 * Here rather than at the call site so the command reads no counters and knows no core count of its own —
 * the same reason `idleNow` lives here. The arithmetic stays in `coresBusy`, which a spec can hand two
 * snapshots.
 */
export const coresBusySince = (before: CpuTimes): number => coresBusy(before, cpuNow(), box());

/** One run of a command in trials mode: how long, how it exited, and what it said when it failed. */
export interface Trial {
  readonly ms: number;
  /** 0 is a pass. Exact, and part of the signature — a timeout and an assertion are not the same failure. */
  readonly code: number;
  readonly stderr: string;
}

/**
 * How many trailing stderr lines a signature is built from.
 *
 * The tail rather than the head: a runner prints its progress first and its reason last. Three, because one
 * is often just `exit 1` and ten drags in enough variable text that nothing groups.
 */
export const SIGNATURE_LINES = 3;

/**
 * What makes two failures the same failure, for grouping only.
 *
 * **It normalises; it does not classify.** There is no list here of failure shapes we know about — that is a
 * restated population, and it is what left the spawn gate blind to nine of the twelve files it was about.
 * What goes in is derived: the exit code, which is exact, and the tail of stderr with the token *shapes*
 * that vary between runs replaced — absolute paths, numbers, durations. Whether a group is a birpc timeout
 * or a real assertion is a question for whoever reads the exemplar, and the caller prints one per group so
 * they can.
 *
 * A pass has no signature. Grouping successes would say only that they succeeded.
 */
export function signatureOf(trial: Pick<Trial, 'code' | 'stderr'>): string {
  if (trial.code === 0) return '';
  const lines = trial.stderr.split('\n').map((line) => line.trim()).filter(Boolean).slice(-SIGNATURE_LINES);
  const normalised = lines.join(' ⏎ ')
    // A directory differs per temp dir and per machine; the file it ends in is the most identifying
    // part of a failure, so the basename stays
    .replace(/(\/[^\s:)'"]+)+/g, (match) => `<path>/${match.split('/').pop()}`)
    .replace(/\b\d+(\.\d+)?(ms|s|m)\b/g, '<t>')  // a duration differs every run by definition
    .replace(/\d+/g, 'N');                      // line numbers, pids, ports, counts
  return `exit ${trial.code}: ${normalised}`;
}

/** Failures by signature, each with one verbatim example — the grouping is a convenience, the text is the evidence. */
export function groupBySignature(trials: readonly Trial[]): { signature: string; count: number; exemplar: string }[] {
  const groups = new Map<string, { count: number; exemplar: string }>();
  for (const trial of trials.filter((t) => t.code !== 0)) {
    const signature = signatureOf(trial);
    const seen = groups.get(signature);
    if (seen) seen.count += 1;
    else groups.set(signature, { count: 1, exemplar: trial.stderr.trim() });
  }
  return [...groups].map(([signature, rest]) => ({ signature, ...rest })).sort((a, b) => b.count - a.count);
}

export const rateOf = (trials: readonly Trial[]): number =>
  trials.length === 0 ? 0 : trials.filter((t) => t.code !== 0).length / trials.length;

/**
 * The 95% upper bound on the failure rate — what a run of clean trials actually licenses you to say.
 *
 * Five clean runs bound it at 45%, twenty at 14%. That arithmetic decided whether to lift the integration
 * pool's worker cap, and it was done by hand in a chat message; a tool that leaves the reader to do it will
 * have readers who don't, and "five clean runs" will get quoted as proof.
 *
 * Exact for the no-failure case (`1 - 0.05^(1/n)`), Wilson otherwise. Both closed form; neither needs a
 * statistics dependency for a number quoted to two significant figures.
 */
export function upperBound(failures: number, trials: number): number {
  if (trials <= 0) throw new Error('an upper bound over no trials is not a bound');
  if (failures === 0) return 1 - 0.05 ** (1 / trials);
  const z = 1.96;
  const observed = failures / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = (observed + (z * z) / (2 * trials)) / denominator;
  const half = (z * Math.sqrt((observed * (1 - observed)) / trials + (z * z) / (4 * trials * trials))) / denominator;
  return Math.min(1, centre + half);
}

/**
 * How long a burner may outlive the process that started it: a safety net for SIGKILL, which nothing in
 * user space survives. `bounded-spawn`'s reaper covers `exit`, a throw and SIGINT/SIGTERM/SIGHUP.
 *
 * Fixed rather than derived from the series. The first version passed one *command's* budget for a whole
 * series, so the load quietly stopped partway through; deriving it the other way would leave twelve cores
 * spinning for twenty hours after a kill.
 */
export const BURNER_CEILING_MS = 2 * 60 * 60 * 1000;

/**
 * N processes burning a core each, so contention is induced rather than waited for — the birpc flake had
 * only ever been seen by accident, and a condition you can produce is one you can measure.
 *
 * Stopped by `signal`, never by handlers of its own. The first version registered SIGINT/SIGTERM/SIGHUP
 * and they could not run, because `spawnSync` held the event loop: three of three survived an interrupt.
 * A second set beside `bounded-spawn`'s reaper would not work either, since it calls `removeAllListeners`
 * before re-raising. One reaper.
 */
export function startBurners(count: number, signal: AbortSignal): void {
  for (let i = 0; i < count; i += 1) {
    void boundedSpawn(process.execPath, ['-e', 'for(;;);'], BURNER_CEILING_MS, { signal });
  }
}

/**
 * The arguments both measure commands take, parsed by the rules `spec-cost`'s `parseArgs` already
 * established: an unknown flag is an error, and so is a flag whose value is missing.
 *
 * **Because the hand-rolled version made a wrong answer quietly.** `npm run measure -- "cmd" --busy` read
 * the token after `--busy`, found nothing, and fell back to *no load at all* — then printed a citation
 * saying the box was 95% idle, with nothing to say the load it had been asked for never happened. Both
 * commands had that, because one was written from the other, and neither had a single case over its
 * arguments. A flag with no value is the shape that produced it, so that is the shape this refuses.
 *
 * Values are `string`; range and kind are the caller's, through `asNumber` and its own bounds, so a
 * message can name what was wrong rather than printing usage at everything.
 */
export interface FlagSpec<V extends string, B extends string> {
  /** Flags that take the next token as their value */
  readonly values: readonly V[];
  /** Flags that are present or absent */
  readonly booleans: readonly B[];
}

export interface Parsed<V extends string, B extends string> {
  readonly values: Partial<Record<V, string>>;
  readonly flags: ReadonlySet<B>;
  /** Everything that was neither a flag nor a flag's value, in order */
  readonly positionals: readonly string[];
}

export function parseFlags<V extends string, B extends string>(
  argv: readonly string[],
  spec: FlagSpec<V, B>,
): Parsed<V, B> {
  const values: Partial<Record<V, string>> = {};
  const flags = new Set<B>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const name = token.slice(2);
    if ((spec.booleans as readonly string[]).includes(name)) {
      flags.add(name as B);
      continue;
    }
    if (!(spec.values as readonly string[]).includes(name)) {
      // `--runs=5` lands here too, which is deliberate: nothing in this repo takes that form, and
      // accepting it silently alongside `--runs 5` is a second spelling of one thing
      throw new Error(`No such flag: ${token}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`\`${token}\` needs a value after it`);
    }
    values[name as V] = value;
    i += 1;
  }
  return { values, flags, positionals };
}

/** A flag's value as a number, or undefined when it was not given. Throws naming the flag, never NaN. */
export function asNumber(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`\`--${flag}\` takes a number, not ${JSON.stringify(raw)}`);
  return value;
}

/**
 * A flag's value as a positive integer, or undefined when it was not given.
 *
 * Beside `asNumber` rather than folded into it, because the range belongs to the caller — `--idle` takes a
 * fraction and `--busy` takes zero. It is a function because two callers want this same bound: the chain's
 * `--cores` and `npm run typecheck`'s, which each hand-rolled it before.
 */
export function asCount(raw: string | undefined, flag: string): number | undefined {
  const value = asNumber(raw, flag);
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1) throw new Error(`\`--${flag}\` takes a positive integer, not ${JSON.stringify(raw)}`);
  return value;
}

