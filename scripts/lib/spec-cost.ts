/**
 * What a spec costs, and which half it therefore belongs in.
 *
 * `@abuddy/cli` runs two suites: a fast one that is the per-change loop, and an integration one for the
 * specs that are expensive. The rule was *"a spec that runs a build, an install or another process is an
 * integration spec"* — spawning as a proxy for cost, which held only while spawning was the only way to be
 * slow. Three counter-examples ended that: a helper that reaches esbuild (which spawns) while reading as
 * clean, a 48s spec with no spawn sites at all, and a 20ms spec classified as spawning because the export
 * it imports defaults to `spawnSync`.
 *
 * So the predicate is the cost itself, recorded rather than inferred. `scripts/spec-cost.ts` measures it;
 * this module is the part a spec and that command share, so the check and the record cannot disagree.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isMeasuredMachine, thisMachine, type Machine } from './core-budget.ts';
import { movedBeyondBand } from './measure.ts';

/**
 * Where a suite's record lives, relative to the repo root. One per package rather than one for the repo:
 * a package's specs are measured by running that package's configs, so the file that records them belongs
 * beside the thing that produced it, next to the other recorded artifacts in `etc/`.
 */
export const specCostFile = (dir: string): string => path.join('packages', dir, 'etc', 'spec-cost.json');

/**
 * The band a spec must leave before it changes half.
 *
 * **A single threshold oscillates, measured.** A file's recorded time is its wall time under whatever else
 * that half is running, so moving a spec changes its cost: `dependency-flow-helpers` read 4.7s in the fast
 * half and 2.4s in the integration half, and a lone threshold between those two numbers would send it back
 * and forth on every update. Four specs did exactly that on the first pass.
 *
 * So there are two edges and a dead band between them. A fast spec moves only when it exceeds
 * `INTEGRATION_ABOVE_MS`; an integration spec comes back only when it drops under `FAST_BELOW_MS`. Anything
 * between stays where it is, which is the answer to noise and to the contention difference alike.
 *
 * **The width is a requirement, not a taste.** A move changes the reading, so the band has to be wider
 * than that change or the two edges contradict each other: a fast spec above the upper edge is told to
 * move, reads lower in the other half, and is told to come back. The condition is the one asserted in
 * `suite-split.spec.ts` — `FAST_BELOW_MS * CONTENTION_RATIO_MAX <= INTEGRATION_ABOVE_MS`. It did not hold
 * until 2026-10-01: the band was 1.67x against readings that differ by up to 1.99x, and
 * `spec-plan.spec.ts` was caught in exactly that loop, told to move in both directions at once.
 *
 * `INTEGRATION_ABOVE_MS` is the policy half of it — what a fast half may cost. 2.5s is the widest gap in
 * the measured distribution (2118 -> 2930, 812ms, about four times the next best), and what it buys is a
 * fast half of roughly 17s of file time, so the per-change loop is still a loop. `FAST_BELOW_MS` is not a
 * second policy: it exists only to stop the oscillation, and 1 000 is the largest round hundred the
 * condition above allows. Both edges compare strictly, so sitting exactly on it is safe.
 */
export const INTEGRATION_ABOVE_MS = 2_500;
export const FAST_BELOW_MS = 1_000;

/**
 * An upper bound on how much more a spec reads in the fast half than in the integration half — never a
 * conversion factor, and never a point estimate. It is what the band has to cover.
 *
 * Measured 2026-10-01 on an idle machine (77%), each spec moved alone and both halves run in one session,
 * over the eight specs then sitting between the edges — the only ones that can reach one:
 *
 *     repo-checks     spec-plan-collect          2001 / 1006   1.99
 *     repo-checks     lint-scope                 1855 / 1193   1.55
 *     repo-checks     fingerprint-scope          1635 / 1142   1.43
 *     repo-checks     bounded-spawn              2060 / 2057   1.00
 *     repo-checks     component-contracts        1690 / 1847   0.91
 *     abuddy-cli      fe-bundler-shared-ui        902 /  926   0.97
 *     publish-checks  published-manifest-paths   1446 / 2030   0.71
 *     abuddy-cli      fe-bundler-proxy-exports   1051 / 1973   0.53
 *
 * **There is no uniform direction**, which is the thing to know before re-measuring: half the sample is
 * below 1. Which way a spec moves depends on which half is heavier in its package — `abuddy-cli`'s
 * integration half holds the compiler specs behind a 50% worker cap, so a spec moving into it gets more
 * expensive. A ratio below 1 cannot produce the loop in either direction, so only the maximum constrains
 * the band.
 *
 * 2.5 against a worst observed of 1.99, because the max of eight one-shot samples understates a
 * population max; because a cost is good to about 20% and a ratio of two inherits that unfavourably; and
 * because the errors are asymmetric — too low reinstates a loop someone has to diagnose, too high only
 * keeps a cheapened integration spec where it is, which no budget minds.
 *
 * Re-measure when either half's shape changes materially — a worker cap, or a spec large enough to move
 * what its neighbours see. The floor on widening is the cheapest integration-half spec, 2007ms on that
 * date: the band may not reach it, or that spec is pulled back and forth instead.
 */
export const CONTENTION_RATIO_MAX = 2.5;

/**
 * What a spec that just changed half says about `CONTENTION_RATIO_MAX`.
 *
 * The constant is a sample, and a sample has no derivation to check it against — which is the shape that
 * produced the defect it exists to prevent, a number nobody re-asks. But a *move* is a measurement of
 * exactly the thing it bounds, taken for free: the record holds what the spec cost in the half it left,
 * and this run measured what it costs in the half it arrived in. So every rename that follows this gate's
 * own advice re-measures the gate's own constant.
 *
 * A move shows up as a path appearing whose counterpart disappeared — the same spec, the suffix toggled.
 * Nothing else pairs that way: an added spec is new and a dropped one is gone.
 */
export function ratiosFromMoves(
  previous: SpecCost | undefined,
  costs: Record<string, number>,
  added: readonly string[],
  onDisk: readonly string[],
): { spec: string; fast: number; integration: number; ratio: number }[] {
  const here = new Set(onDisk);
  const other = (file: string): string => (halfOfPath(file) === 'fast'
    ? file.replace(/\.spec\.ts$/, INTEGRATION_SUFFIX)
    : `${file.slice(0, -INTEGRATION_SUFFIX.length)}.spec.ts`);
  return added.flatMap((spec) => {
    const was = other(spec);
    const before = previous?.costs[was];
    const now = costs[spec];
    // The counterpart has to be gone from disk, not merely unmeasured: a named run measures one config, so
    // "no reading for the other half" is true of every spec in the suite and would pair an ordinary new
    // spec with whatever happens to share its name in the other half
    if (here.has(was) || before === undefined || now === undefined || now <= 0 || before <= 0) return [];
    const [fast, integration] = halfOfPath(spec) === 'fast' ? [now, before] : [before, now];
    // A cheap spec's ratio is noise about the band, and acting on it is worse than ignoring it: a 10ms spec
    // reading 3ms in the other half is 3.33x, which would advise raising the bound and so *lowering* the
    // return edge over 7ms of jitter. Only a spec that could reach an edge says anything about where the
    // edges go, and below the return edge no cost can be asked to move.
    if (Math.max(fast, integration) < FAST_BELOW_MS) return [];
    return [{ spec, fast, integration, ratio: fast / integration }];
  });
}

/** A move whose ratio the band does not cover: evidence that `CONTENTION_RATIO_MAX` is too low. */
export const underBound = (
  found: readonly { ratio: number }[],
): boolean => found.some(({ ratio }) => ratio > CONTENTION_RATIO_MAX);

/** What a recorded cost is good to (`goal-measured-placement.md`), and so how close to an edge is close. */
export const COST_ACCURACY = 0.2;

/**
 * How far a spec is from the edge that could actually move it, as a share of its cost.
 *
 * **Which edge depends on the half.** A fast spec only ever leaves above `INTEGRATION_ABOVE_MS`; an
 * integration spec only comes back below `FAST_BELOW_MS`. Reporting band membership instead treated those
 * as one question, so a fast spec at 1 673ms was listed as one a re-measurement could move when it would
 * have had to nearly double. Widening the band made that louder rather than quieter — the membership list
 * grew by five specs that cannot move at all.
 */
export function towardEdge(file: string, ms: number): number {
  const edge = halfOfPath(file) === 'fast' ? INTEGRATION_ABOVE_MS : FAST_BELOW_MS;
  return Math.abs(edge - ms) / ms;
}

/** Whether a re-measurement inside the record's own accuracy could carry this spec over its edge. */
export const nearEdge = (file: string, ms: number): boolean => towardEdge(file, ms) <= COST_ACCURACY;

/**
 * A spec whose latest reading crossed an edge while its median has not: one agreeing reading from moving.
 *
 * **Reported, never acted on, and that distinction is the whole point of the window.** The old record
 * adopted a crossing from one reading and a gate then demanded a rename; this says the same thing a run
 * earlier, as information, and lets the second reading decide. A reader who sees it can re-measure
 * deliberately instead of discovering it as a failure.
 *
 * Only the newest reading is asked about, because the older ones are what the median already reflects.
 */
export const provisional = (
  file: string, samples: readonly number[],
): { readonly file: string; readonly reading: number; readonly median: number; readonly belongs: Half } | undefined => {
  const latest = samples.at(-1);
  if (latest === undefined || samples.length < 2) return undefined;
  const median = costOf(samples);
  const belongs = halfFor(file, latest);
  return belongs !== halfOfPath(file) && halfFor(file, median) === halfOfPath(file)
    ? { file, reading: latest, median, belongs }
    : undefined;
};

/**
 * How many recent readings a spec keeps.
 *
 * Three, which is the fewest that can reject one reading. The decision a cost is *for* has a cliff —
 * `halfFor` moves a spec across `INTEGRATION_ABOVE_MS` — and a cliff crossed by a single sample is a file
 * rename demanded on one number. Measured 2026-10-03: a recording taken at 78% idle, above `IDLE_FLOOR`,
 * read `chain-inputs` at 2791ms where two clean runs read 2041 and 2186, and the gate asked for two specs
 * nobody had touched to be renamed.
 *
 * Five would reject two readings and be a run slower to believe a real change. Three is where that trade
 * sits while a crossing is rare and a re-measure is cheap.
 *
 * **How often three is reached is a question for the command, not this paragraph.**
 * `npm run spec-cost:check -- --list` reports how many costs rest on more than one reading, per suite and in
 * total, so the argument above is weighed against what the records hold rather than against a figure written
 * here that would drift. Ask it before reading any of this as a mechanism in steady use — it has answered as
 * low as 1 of 389.
 *
 * **Two limits of a window of any size, worth knowing before trusting one.** A spec's *first* reading is its
 * cost outright — `settle` has no history to weigh it against — so a contended first measurement can demand a
 * rename immediately, and `refusesAsContended` excludes an addition from `comparable`, so a run that is mostly
 * new specs will not be refused for it either. And a window **only ever accumulates readings that disagreed**:
 * an agreeing one is dropped, so a clean re-measure cannot displace a parked outlier, and the median moves
 * whenever two outliers land on the same side of the incumbent — which two independently contended runs
 * satisfy however far apart they are.
 *
 * **The two together mean a wrong one-reading cost cannot be re-measured out**, which is the consequence worth
 * stating because it is the one a reader acts on. Only a reading *outside* the band is kept, and a clean
 * reading of a spec whose single reading was contended is normally inside it — measured 2026-10-03, the
 * recorded 2791 against clean runs at 2186 and 2041, both dropped. So neither `spec-cost:update <path>` nor
 * `--all` can replace it, and `--all --forget` on a quiet machine is the only route: correcting one spec means
 * dropping the whole suite's history. `describeBudget`'s advice says so where a rename rests on one reading.
 *
 * None of this is fixable by a longer window, and `provisional` is what mitigates it: it reports a crossing the
 * run *before* the gate acts on it, so the state this leaves is one a reader is told about rather than one they
 * discover as a failure.
 *
 * **More than one reading is the half of a split, and nothing upstream covers the other side of it.**
 * `RECORD_IDLE_FLOOR` (`measure.ts`) keeps a recording's *body* honest and is set from measured drift; it is
 * not sized to stop a single contended reading placing a spec in the wrong half, and the episode that
 * prompted both happened at 78% idle, above the floor of the day and below the one that replaced it. So a
 * crossing is absorbed here or nowhere. **Set this to 1 and the floor becomes load-bearing for something it
 * was never measured against** — which `suite-split.spec.ts`'s replay case catches, reading 2791 where it
 * expects 2041: the contended reading becoming the answer, which is the defect rather than a claim about a
 * constant. The number itself is the outlier-rejection argument above.
 */
export const WINDOW = 3;

/**
 * What a window says a spec costs: the median of its readings, and the incumbent on a tie.
 *
 * **The median rather than the mean, because the point is to reject a reading and not to average it in.**
 * One contended reading in three moves a mean by a third of its error and a median not at all. Two
 * agreeing readings move both, which is the property wanted: a real change is adopted and a noisy one is
 * not.
 *
 * **One kept reading can move a three-window's median, and it cannot move the spec's half.** The eviction
 * takes the oldest, so a new reading above the median replaces one below it and the middle shifts. That changes
 * the number a reader sees and never the placement, which is the only thing the record is consulted for: a
 * median of three exceeds an edge only when two of the three do. Verified exhaustively 2026-10-03 over every
 * window and reading on a 100ms grid — 630 270 kept readings, no crossing with fewer than two readings past the
 * edge. An eviction policy that knew about edges would be machinery for a number nobody reads directly.
 *
 * **A window of two answers with its older reading, which is not the textbook median and is the point.**
 * The ordinary definition averages the two middles, and that was written here first — it lets one extreme
 * reading carry the answer half of its own distance, which across an edge is the whole defect back again:
 * `[2041] + 4000` means 3021 and crosses `INTEGRATION_ABOVE_MS` on one reading. The two readings in a
 * two-window disagree by construction — disagreeing is why the second was kept — so there is no majority
 * to be had, and a decision with no majority behind it should leave the answer where it was. The third
 * reading breaks the tie, in whichever direction it agrees with.
 *
 * Only a length of two is affected: `WINDOW` is three, so a window is 1, 2 or 3 readings long.
 */
export function costOf(samples: readonly number[]): number {
  // An empty window reaches the `!` below and yields `undefined`. No input produces one: `readSpecCost`
  // refuses a record holding one, `settle` writes `[ms]` for a spec it has not seen, and `appendSample` only
  // ever adds. The edits that would make it fire are a writer that stores an empty window, or that validation
  // dropping its `length > 0` — so this is an assertion about the module's own construction rather than a gate
  // with a case to write.
  if (samples.length === 2) return samples[0]!;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** A reading added to a window, which keeps the most recent `WINDOW` and drops the oldest */
export const appendSample = (samples: readonly number[], reading: number): number[] =>
  [...samples, reading].slice(-WINDOW);

export interface SpecCost {
  /**
   * The recent readings behind each spec's cost, oldest first.
   *
   * **This is what is stored; `costs` below is derived from it.** Two records of one fact is the failure
   * root `CLAUDE.md` names, so the median is never written down — it is taken on every read, which makes
   * the half a *derivation* over a sample rather than a sample consulted directly.
   */
  readonly samples: Record<string, readonly number[]>;
  /**
   * What each spec costs: `costOf` over its readings. Derived on read, never stored.
   *
   * Kept as a field because every consumer wants the one number — the placement rule, `spec:dry`'s sum,
   * the fast half's budget — and none of them wants to know a window exists.
   */
  readonly costs: Record<string, number>;
  /**
   * Specs that ran nothing because every test in them was skipped, so they have no cost to record.
   *
   * This is a third state, and collapsing it into either of the others is a trap. Treating such a file as
   * costing nothing would file it as the cheapest spec in the suite and place it accordingly, until the day
   * its precondition is met and it runs — `features/code/be/claude-code-permission-flow` needs a real `claude`
   * binary. Treating it as unmeasured would fail the check forever for a file that is behaving correctly.
   * Recorded here it is neither, and `spec-cost:check` notices when one starts reporting a duration.
   */
  readonly skipped: string[];
  /**
   * Specs present in the suite with no cost yet, because the machine that added them is not this record's.
   *
   * **A fourth state, and the one that lets anyone but the measuring machine contribute.** A record holds two
   * kinds of thing: *membership* — which specs exist, which is a fact about the repo — and *cost*, which is a
   * fact about a machine. They were one map, so adding a spec meant measuring it, and the only way a second
   * developer could satisfy `unrecorded` was to write their own box's milliseconds into a record measured on
   * someone else's. Listed here a spec is recorded without being priced: `unrecorded` is satisfied, the
   * placement cases have no cost to place it on and skip it, and the measuring machine fills it in on its
   * next run.
   *
   * Distinct from `skipped` for the reason that doc gives about collapsing states: a skipped spec ran and
   * reported nothing, which is permanent and correct; an unmeasured one has never run here.
   */
  readonly unmeasured: string[];
  /**
   * The machine these costs were measured on, which is what says whether they apply to the reader.
   *
   * Recorded here rather than read from `MEASURED_ON` (`chain-steps.ts`), which describes the box the
   * *chain's* seconds were taken on. Two records, two machines, and nothing made them the same box — so
   * scoping this record's checks on that constant was scoping on a fact about something else.
   */
  readonly machine: Machine;
  readonly measuredAt: string;
}

export const INTEGRATION_SUFFIX = '.integration.spec.ts';

/**
 * The record as it is written: the same thing without the derived half.
 *
 * A separate type rather than an optional field, so that nothing can write a `costs` map by accident and
 * have it read back as authoritative. `writeRecord` takes this; `readSpecCost` returns `SpecCost`.
 */
export type StoredSpecCost = Omit<SpecCost, 'costs'>;

/** The record as it is stored, with the derived map dropped */
export const forStorage = ({ costs: _costs, ...stored }: SpecCost): StoredSpecCost => stored;

/** A record with its costs taken from its windows, which is the only place that derivation happens */
export const withCosts = (stored: StoredSpecCost): SpecCost => ({
  ...stored,
  costs: Object.fromEntries(Object.entries(stored.samples).map(([spec, samples]) => [spec, costOf(samples)])),
});

/**
 * How far a new measurement must move before it replaces the recorded one.
 *
 * A cost is a **sample**, not a derivation: re-running the measurement does not reproduce it. Measured over
 * two runs on an idle machine, 125 of 163 entries changed — median drift 10-18%, p90 50-75% — because 304 of
 * the 366 specs are under 500ms, where a few milliseconds is a large *relative* change. Recording every
 * sample therefore rewrote most of the file every time, and a real movement had nowhere to be seen.
 *
 * Wide enough for that jitter and no wider, because something does sum these. `moved` records any
 * measurement that would place the spec in a different half before it looks at magnitude at all, so this
 * number never has to catch a crossing — but `suite-split` adds up `abuddy-cli`'s fast half against a
 * budget, and every spec's tolerance is slack in that total. At `max(500ms, 50%)` the worst sum the record
 * permitted was 36 602ms against a 30 000ms budget, so the check could pass over a breach; here it is
 * 28 369ms. Both settle the same 1 entry of 163 between two idle runs, so the narrower pair costs nothing.
 *
 * It compounds rather than hides a slow creep: the tolerance is relative to the *recorded* value, which stays
 * put, so 400 -> 480 -> 576 exceeds it on the third step rather than never.
 */
export const SETTLED_MS = 300;

/**
 * Whether a fresh reading says something the window does not already say, and so is worth keeping.
 *
 * **It had a clause for a crossing and that clause was the defect.** It read "a measurement that would
 * place the spec in a different half is always recorded, exactly", on the reasoning that a cost is only
 * consulted to place a spec. The premise is right and the conclusion inverts it: the one decision with a
 * cliff was the one where a single reading was trusted unconditionally, so a contended run moved two specs
 * across `INTEGRATION_ABOVE_MS` and the gate demanded two renames. A crossing is now adopted when the
 * *median* crosses, which takes two readings that agree.
 *
 * What is left is the band, and it is doing the job it always did: keep the window from growing on jitter.
 * `generated-behind-contract` runs codegen over a temp pack and swings 714-995ms between idle runs; both
 * say the same thing, and neither is worth a row in the log.
 */
export const disagrees = (recorded: number | undefined, measured: number): boolean =>
  recorded === undefined || movedBeyondBand(recorded, measured, SETTLED_MS);

/**
 * Whether a reading is worth keeping: it disagrees with the median, **or** it lands in the other half.
 *
 * **The band scales with the value and the edge does not, so for the specs nearest the edge the band swallowed
 * it.** `disagrees` drops a reading inside `max(300ms, 35%)`, and 35% of a cost near `INTEGRATION_ABOVE_MS` is
 * wider than the distance to it: measured 2026-10-03 against the real records, 7 of 363 fast specs had an
 * agree-band reaching past the edge — `spec-plan-collect` at 2421 was invisible up to 3268. A genuine move
 * into the integration half could not even be *kept* for those, so the median never moved, the gate never
 * fired, and `priceSpecs` went on summing a number that was no longer true. The window was most inert for
 * exactly the specs placement is about.
 *
 * **`moved` had this clause and it was deleted as the cause of the original defect.** It was right about what
 * to *notice* and wrong about what to *do*: it recorded the crossing outright, so one contended reading moved
 * a spec's half. Here it decides only whether the reading is *kept*, which is what the window was built to
 * make safe — a crossing joins the window, the median stays with the incumbent, `provisional` reports it, and
 * two agreeing readings adopt it.
 *
 * Composed rather than folded into `disagrees`, so the band keeps one meaning and this stays a decision of its
 * own with its own name — and so `disagrees`' own cases go on asking only about the band.
 */
export const worthKeeping = (file: string, recorded: number | undefined, measured: number): boolean =>
  disagrees(recorded, measured)
  || (recorded !== undefined && halfFor(file, recorded) !== halfFor(file, measured));


/** What a run changed, told apart: a spec measured for the first time is not evidence about the machine */
export interface Changes {
  readonly added: readonly string[];
  /**
   * Specs whose window this run grew, because the reading disagreed with the median.
   *
   * **This is the set that says what the conditions were**, and it is the one `refusesAsContended` counts.
   * A loaded machine makes most readings disagree at once, whether or not any median ends up moving — so
   * asking "how many answers changed" would under-report exactly the run worth refusing. Counting the new
   * ones instead refused eight new specs in a suite of twenty-eight as "a loaded machine", which is the
   * wrong sentence about the right number, so `added` stays separate.
   */
  readonly appended: readonly string[];
  /**
   * Specs whose derived cost actually changed, which is what a reader of the record sees.
   *
   * A subset of `appended`, and usually a small one: a first disagreeing reading is kept and changes
   * nothing, and the median moves on the second that agrees with it. Their difference is the whole value
   * of the window, and the only place a reader can see it.
   */
  readonly moved: readonly string[];
}

/**
 * What this run did to the specs it measured: which are new, whose window it grew, and whose answer that
 * actually moved.
 *
 * Apart, because they answer different questions and a call site wanted each. A record is written for any
 * of them.
 */
export function changesIn(
  previous: SpecCost | undefined,
  settled: Record<string, readonly number[]>,
  readings: Record<string, number>,
): Changes {
  const measured = Object.keys(readings);
  const before = (spec: string): readonly number[] | undefined => previous?.samples[spec];
  const kept = measured.filter((spec) => {
    const was = before(spec);
    return was !== undefined && JSON.stringify(settled[spec] ?? []) !== JSON.stringify(was);
  });
  return {
    added: measured.filter((spec) => before(spec) === undefined),
    appended: kept,
    moved: kept.filter((spec) => costOf(settled[spec]!) !== costOf(before(spec)!)),
  };
}

/** The guard that reads this record. It is the one spec that skips itself while the record is rewritten. */
export const PLACEMENT_GUARD = 'tests/suite-split.spec.ts';
/**
 * The two halves, as one declaration: the list is the definition and the type is derived from it.
 *
 * Written twice, a consumer that iterates the halves and a consumer that switches on them disagree the day a
 * third is added — the failure the root `CLAUDE.md` records for `PackRuleKey`, `APP_ENVS` and `ALL_COLORS`.
 * `CONFIG_BY_HALF` below is keyed by the type, so a half with no config is a compile error rather than a
 * lookup that returns undefined.
 */
export const HALVES = ['fast', 'integration'] as const;
export type Half = (typeof HALVES)[number];
export const halfOfPath = (file: string): Half => (file.endsWith(INTEGRATION_SUFFIX) ? 'integration' : 'fast');

/** Where a spec belongs, given where it is now: it stays put inside the dead band */
export function halfFor(file: string, ms: number): Half {
  const now = halfOfPath(file);
  if (now === 'fast' && ms > INTEGRATION_ABOVE_MS) return 'integration';
  if (now === 'integration' && ms < FAST_BELOW_MS) return 'fast';
  return now;
}

/**
 * The record, or `undefined` for anything this cannot read as one.
 *
 * **A file missing a field is unreadable, not a record with a hole in it.** `JSON.parse` returns whatever is
 * there and the cast says otherwise, so a record written before a field existed arrived typed as complete and
 * crashed its first reader: dropping `machine` from one of the twelve made `suite-split.spec.ts` fail at
 * collection with `Cannot read properties of undefined (reading 'cpu')` and **run no tests at all** — the
 * worst shape available, since a suite that collapses reports nothing rather than failing about something.
 * Reachable from a branch not yet rebased, a stash, a revert or a merge from before the field landed.
 *
 * `undefined` rather than a throw, because the callers already handle it and handle it well: `check` reports
 * *"no <file>; run spec-cost:update"*, which is the right advice for a record that has to be re-taken. This
 * repo keeps no backward compatibility, so requiring that is the policy — saying so is the part that was
 * missing.
 */
export function readSpecCost(repoRoot: string, dir: string): SpecCost | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(repoRoot, specCostFile(dir)), 'utf-8')) as StoredSpecCost;
    // `samples` rather than `costs`, which is what makes a record from before the window read as absent
    // rather than as a record holding point estimates — the policy this repo already applies to a missing
    // field, and the reason there is no version number to compare
    const windows = typeof parsed?.samples === 'object' && parsed.samples !== null
      && Object.values(parsed.samples).every((window) => Array.isArray(window) && window.length > 0
        && window.every((reading) => typeof reading === 'number'));
    const complete = typeof parsed?.measuredAt === 'string' && windows
      && Array.isArray(parsed.skipped) && Array.isArray(parsed.unmeasured)
      && typeof parsed.machine?.cpu === 'string' && typeof parsed.machine.cores === 'number';
    return complete ? withCosts(parsed) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The vitest configs a package runs its specs under. `@abuddy/cli` has two, a fast half and an integration
 * half; every other suite has one. A spec's cost is measured under the config that actually runs it, which
 * is why this is read from the package rather than assumed.
 */
/**
 * Which config runs each half, as one declaration rather than two lists that can disagree.
 *
 * `configsFor` derives its order from this, and naming a spec derives its config from it the other way —
 * which is what lets `spec-cost:update <path>` run the half that spec lives in instead of the whole suite.
 */
export const CONFIG_BY_HALF: Readonly<Record<Half, string>> = {
  fast: 'vitest.config.ts',
  integration: 'vitest.integration.config.ts',
};

export function configsFor(packageDir: string): string[] {
  return Object.values(CONFIG_BY_HALF).filter((file) => fs.existsSync(path.join(packageDir, file)));
}

/**
 * The configs that must run to measure these specs: each one's half, and nothing else.
 *
 * A spec measured on its own is not comparable to one measured beside its siblings — `chain-inputs` reads
 * 1688ms in its config and 963ms alone, against a band 1000ms wide — so the unit is the config, never the
 * file. A half whose config is missing falls back to everything the package has, since the spec still has to
 * be measured somewhere.
 */
export function configsOf(packageDir: string, specs: readonly string[]): string[] {
  const all = configsFor(packageDir);
  const wanted = new Set(specs.map((spec) => CONFIG_BY_HALF[halfOfPath(spec)]));
  const known = all.filter((config) => wanted.has(config));
  return known.length === wanted.size ? known : all;
}

/** A package with one config has no second half to move a spec into — Decision 4 makes that a finding */
export const hasSplit = (packageDir: string): boolean => configsFor(packageDir).length > 1;

/**
 * Every spec a package owns, relative to the package.
 *
 * Both `tests/` and `src/`, and `src/` is now a net rather than a necessity. It was there because
 * `@app/default-setup` ran six colocated specs and walking only `tests/` reported them as
 * recorded-but-gone; those moved under `tests/` and no package colocates any more. Keeping the walk is
 * what stops the next one being silent twice over: no config includes `src/**` now, so such a spec would
 * never run, and if this did not see it the record would not report it missing either. As it is, it lands
 * here with no measured cost and `suite-split.spec.ts` says so by name.
 *
 * Ignoring what a package builds keeps the walk to sources: `dist` holds compiled copies, and `etc` is
 * where the record itself lives.
 */
// `templates` holds the CLI's scaffold: `templates/pack/tests/*.spec.ts` is a spec a pack author will run,
// not one of this package's, and vitest's own `include` already leaves it out
const IGNORED = new Set(['node_modules', 'dist', 'etc', 'coverage', 'templates']);
export function specFiles(packageDir: string): string[] {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith('.') || IGNORED.has(entry.name)) return [];
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(spec|test)\.ts$/.test(entry.name) ? [path.relative(packageDir, full)] : [];
    });
  return walk(packageDir).sort();
}

/**
 * A spec whose cost its placement cannot justify. The two kinds take different fixes, which is why they are
 * one union rather than two lists: a package with both halves can move the spec, and a package with one
 * cannot, so the second is a thing to record rather than a thing to do.
 */
export type Budget =
  /**
   * Both halves exist and the cost names the other one: renaming the file is the fix.
   *
   * `readings` is how many are behind `ms`, and it is here because the advice depends on it: one reading is a
   * cost a re-measurement can still move, the median of three is not. Saying "two readings agree" without it
   * was true of no window in the repo — 388 of 389 held a single reading — and it told a developer to skip
   * the one action that catches a bad one.
   */
  | {
    readonly kind: 'rename'; readonly file: string; readonly ms: number; readonly belongs: Half;
    readonly readings: number;
  }
  /** One half, so there is nowhere to move it: the fix is an `EXPENSIVE_BY_NATURE` entry */
  | { readonly kind: 'over'; readonly file: string; readonly ms: number };

/** Specs whose filename puts them in one half while their recorded cost puts them in the other */
const misplaced = (samples: Record<string, readonly number[]>, files: readonly string[]): Budget[] =>
  files.flatMap((file) => {
    const window = samples[file];
    if (window === undefined) return [];
    const ms = costOf(window);
    const belongs = halfFor(file, ms);
    return belongs === halfOfPath(file)
      ? [] : [{ kind: 'rename' as const, file, ms, belongs, readings: window.length }];
  });

/** Specs with no recorded cost and no recorded reason: a new one is unmeasured until `spec-cost:update` runs */
export const unrecorded = (record: SpecCost, files: readonly string[]): string[] =>
  files.filter((file) => record.costs[file] === undefined
    && !record.skipped.includes(file) && !record.unmeasured.includes(file));

/**
 * Specs costing more than a fast half allows, in a package that has no slower half.
 *
 * Decision 4: a finding, not an exception and not a reason to raise a budget. What the finding is *for* is
 * knowing — a cost nobody has looked at is the failure this whole record exists against. It is not a
 * request to split the package: a split buys a different size, and slowness alone does not need one.
 * `suite-split.spec.ts` carries the criterion and the measurement behind it.
 */
const outgrown = (samples: Record<string, readonly number[]>, files: readonly string[]): Budget[] =>
  files.flatMap((file) => {
    const window = samples[file];
    if (window === undefined) return [];
    const ms = costOf(window);
    return ms > INTEGRATION_ABOVE_MS ? [{ kind: 'over' as const, file, ms }] : [];
  });

/**
 * Every spec whose cost its placement cannot justify, asked of the **package** rather than of a half.
 *
 * The two predicates above answer for two package shapes, and the precondition that chooses between them
 * used to live at each call site: four callers, two of which remembered it. The one that forgot told a
 * one-half package that two of its specs were "in the wrong half" and named a half that package does not
 * have — advice that, followed, renames a file which still matches the same `include` glob, so the spec
 * keeps running exactly where it was while the warning goes quiet.
 *
 * So the question is asked here, once. A caller renders the `kind` it is handed and cannot ask the wrong
 * one.
 */
/**
 * The windows rather than the derived costs, so that a finding carries how many readings are behind it.
 *
 * One map and not two: handed `costs` beside `samples` a caller could pass a cost from one record and a window
 * from another, and the derivation exists so that cannot happen. `costOf` is taken here instead.
 */
export const overBudget = (
  packageDir: string, samples: Record<string, readonly number[]>, files: readonly string[],
): Budget[] => (hasSplit(packageDir) ? misplaced : outgrown)(samples, files);

/**
 * Specs that cost more than a fast half allows, in a package with one suite. Each entry records what makes
 * that spec expensive, so the cost is known rather than discovered.
 *
 * **This is not a queue of packages to split**, which is what an earlier version of it implied. A split
 * buys a different *size* — a different timeout budget and a different worker cap — and that is the
 * criterion, not slowness. `@abuddy/cli` has two halves because its expensive specs spawn compilers, so
 * they need a 50% worker cap and a large target's 60s; the fast half needs neither.
 *
 * Measured 2026-09-25, none of the entries below qualifies. They build TypeScript programs in-process or
 * wait on real timing — no spawn, so no worker cap — and their slowest single tests are around a second
 * against a small target's 15s. Splitting their packages would buy a faster whole-suite run, which is not the dev
 * loop: `npm run spec -- <file>` is file-targeted, and the chain pools projects and runs only the stale
 * ones. So all three packages stay as they are, on the measurement.
 *
 * What the list is for is the other direction. The check fails on a spec that has become expensive and is
 * not listed, **and** on a listed one that has become cheap, so neither the cost nor the reason can quietly
 * stop being true.
 */
export const EXPENSIVE_BY_NATURE: Record<string, string> = {
  // 94 tests: 91 call `generatePackFiles` with a different manifest each (~7.2s, different work every time
  // and so not cacheable), and 3 build TypeScript programs (2.5s since they share a compiler host).
  // Measured in goal-one-job-pool.md Phase 5, which also records why the split it proposed was not done.
  'abuddy-sdk/tests/build/generate-entries.spec.ts': 'runs codegen 91 times and the compiler 3 times',
  // Holds the repo's slowest single test at 4.1s. It spawns real processes and waits on real lock
  // timeouts, so its cost is elapsed time rather than work, and no amount of cores shortens it.
  'abuddy-host/tests/database/write-lock.spec.ts': 'waits on real cross-process lock timeouts',
  // Seven `npm pack --dry-run` spawns at ~0.3s each. Asking npm what it would publish is the subject, not an
  // implementation detail of the test: the module exists because reading `files` ourselves lost npm's
  // force-included files. Trimming two of the calls would land it about at the 2.5s edge, where a contended
  // measurement decides whether it is reported at all — `@abuddy/host` has one half, so there is no band here
  // and nothing to flip to, only `outgrown`'s single threshold. Re-measured on an idle machine and it came
  // back slightly slower, not faster, so the entry is not an artefact of load.
  'abuddy-host/tests/build/published-manifest.spec.ts': 'spawns npm pack seven times, which is its subject',
  // Starts and stops real pack backends and then waits to prove a cron schedule does *not* tick into the
  // next test. The wait is the assertion, so shortening it removes what the test checks.
  'default-setup/tests/harness-app-stop.spec.ts': 'waits to prove a stopped schedule does not tick',
  // Builds a TypeScript program over the pack to check a diagnostic names the event a send is for.
  'default-setup/tests/send-to-system-diagnostics.spec.ts': 'builds a TypeScript program over the pack',
};

/**
 * How a run says what it found, as a value a spec can read.
 *
 * Here rather than inline in the command for the reason `parseArgs`, `planFor` and `settle` are here: the
 * command runs on import and prints, so a decision written there can only be exercised by running it — and
 * this one is worse than most, because `--dry` reports no finding at all, so the wording was reachable only
 * by a measuring run that rewrites the records. The defect this replaces *was* a string.
 *
 * `tail` goes on the suite's line; `lines` are the findings under it; `advice` is what to do, and it is
 * different for each kind, which is the whole value of telling them apart.
 */
/**
 * What to tell someone whose spec is in the wrong half.
 *
 * **It says nothing about what a re-measurement would do, which took three tries to get right.** Each
 * version claimed a guarantee the window does not give: *"no measurement will move it"*, then *"two readings
 * agree, so re-measuring will not move it"* — true of no window in the repo — then *"the median of N
 * readings, so re-measuring will not move it"*, which is false at every length. A three-reading median moves
 * on **one** reading when the eviction takes the oldest from under it (`[1000, 4000, 5000]` + 6000 is 5000),
 * and a two-reading cost is not a median at all but the incumbent, which one agreeing reading replaces.
 *
 * So the count goes on each finding's own line, where a per-spec fact belongs, and what is left here is the
 * one thing that is both true and actionable: an in-band re-measurement of a single-reading cost is
 * *dropped*, so the command this used to name cannot replace it and `--all --forget` is what can.
 *
 * Called with no renames it returns the bare instruction, which no caller does — both guard on `length > 0`.
 * The edit that would reach it is dropping one of those guards.
 */
/**
 * What a cost rests on, as a line naming one spec says it.
 *
 * **It says what is standing rather than how many were taken**, because at two those are different things.
 * A two-reading window's cost is `costOf`'s incumbent — the *older* of two readings that disagree — so
 * `2 readings` read as better-supported than a fresh single reading while being a possibly stale number with a
 * contradicting one beside it. The phrasing is the fix; the branch in `costOf` is right.
 */
export const readingsText = (readings: number): string => {
  if (readings === 1) return '1 reading';
  return readings === 2 ? '2 disagreeing, older standing' : `median of ${readings}`;
};

export const renameAdvice = (renames: readonly { readonly readings: number }[]): string => {
  const it = renames.length === 1 ? 'it' : 'them';
  const move = `Rename ${it} into the half the cost implies.`;
  return renames.some((found) => found.readings === 1)
    ? `${move} A cost resting on one reading can be a contended run, and a clean re-measurement inside the `
      + 'band is dropped rather than recorded — so `npm run spec-cost:update -- --all --forget` on a quiet '
      + 'machine is what replaces one, and re-measuring that spec alone will not.'
    : move;
};

export function describeBudget(
  findings: readonly Budget[],
  suiteDir: string,
): { tail: string; lines: string[]; advice: string } {
  const renames = findings.filter((found) => found.kind === 'rename');
  // An `over` finding whose reason is already recorded is one somebody has looked at, which is the whole
  // thing this finding is for. Reporting it anyway printed `record it in EXPENSIVE_BY_NATURE` on every run
  // for all five entries that were already in there — advice nobody can act on, in the one channel that has
  // to stay worth reading. The list moved here from `suite-split.spec.ts` so that the report and the gate
  // read the same declaration; the gate still sees every finding, because it asks `overBudget` directly.
  const over = findings.filter((found) => found.kind === 'over'
    && !(`${suiteDir}/${found.file}` in EXPENSIVE_BY_NATURE));
  const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
  return {
    tail: [
      renames.length > 0 ? `${renames.length} in the wrong half` : '',
      over.length > 0 ? `${over.length} over the ${INTEGRATION_ABOVE_MS / 1000}s a fast half allows` : '',
    ].filter(Boolean).join(', '),
    // The reading count sits on the rename's own line, because how settled a cost is, is a fact about that
    // spec rather than about the advice — which is what let the advice stop claiming a guarantee for all of them
    lines: [...renames, ...over].map((found) => (found.kind === 'rename'
      ? `  ${seconds(found.ms)} (${readingsText(found.readings)})  ${found.file}  ->  ${found.belongs}`
      : `  ${seconds(found.ms)}  ${found.file}  (no slower half to move it to)`)),
    advice: [
      renames.length > 0 ? renameAdvice(renames) : '',
      over.length > 0 ? 'Make it cheaper, or record it in EXPENSIVE_BY_NATURE with what makes it expensive.' : '',
    ].filter(Boolean).join('\n'),
  };
}


/** Recorded specs that no longer exist */
export const stale = (record: SpecCost, files: readonly string[]): string[] =>
  [...Object.keys(record.samples), ...record.skipped, ...record.unmeasured]
    .filter((file) => !files.includes(file)).sort();

/**
 * Whether this suite will write membership and measure nothing — which decides, among other things,
 * whether the machine has to be quiet.
 *
 * One rule with two readers: the command's idle gate asks it before deciding to refuse a busy box, and
 * the loop asks it again to take the membership branch. Written twice they come apart, and the way they
 * came apart is the reason this exists: the refusal ran first and unconditionally, so a second developer
 * adding a spec on a busy machine was refused for a write that takes no reading at all.
 *
 * `adopt` is `--all --force`, which is how a machine takes a record over — it re-measures every row, so
 * it is the one case where another machine's record still means measuring.
 *
 * It takes a record rather than `SpecCost | undefined`: whether one *exists* is a different question from
 * whose machine it is, and each caller already has the answer in hand. A type predicate was tried instead
 * and is wrong — `false` here does not mean the record is absent, so narrowing on it made the measuring
 * path's `previous` read as `never`.
 */
export const writesMembershipOnly = (previous: SpecCost, adopt: boolean): boolean =>
  !adopt && !isMeasuredMachine(previous.machine);

/**
 * The record with its membership brought up to date and not one cost touched.
 *
 * What a machine that is not the record's may write: a spec that has appeared is listed as `unmeasured`, a
 * spec that has gone leaves whichever list held it. Nothing is measured, so nothing claims to have been.
 */
export function recordMembership(previous: SpecCost, files: readonly string[]): SpecCost {
  const gone = new Set(stale(previous, files));
  const samples = Object.fromEntries(Object.entries(previous.samples).filter(([file]) => !gone.has(file)));
  const skipped = previous.skipped.filter((file) => !gone.has(file));
  const kept = previous.unmeasured.filter((file) => !gone.has(file));
  const appeared = unrecorded(withCosts({ ...forStorage(previous), samples, skipped }), files);
  return withCosts({
    ...forStorage(previous), samples, skipped, unmeasured: [...new Set([...kept, ...appeared])].sort(),
  });
}

/**
 * The command's arguments, checked against the suites that exist.
 *
 * Here rather than at module scope in `scripts/spec-cost.ts`, because that file runs its command on import:
 * parsing written there can only be exercised by running the command, which is why the failure this guards
 * against is an argument accepted and then not used. The suites arrive as data, so a case can drop one from
 * a copy and watch the answer flip.
 *
 * **It refuses a contradiction rather than picking a winner.** `--suite` with a path in another suite, and
 * `--all` with a path, each name two different bodies of work; honouring either silently means reporting
 * that the other was done. An error costs one run and a wrong winner costs a record nobody knows is stale.
 */
export type SpecCostMode = 'check' | 'list' | 'update';

/**
 * Every flag the command defines, as one declaration.
 *
 * Read twice — once to find each flag, once to refuse anything else — so a seventh flag cannot be added
 * without joining the list. A flag dropped in silence is worst for `--dry`, where it means a measuring run
 * and a rewritten record in place of the error that was asked for.
 */
export const SPEC_COST_FLAGS = ['all', 'dry', 'force', 'list', 'forget', 'suite', 'update'] as const;
export type SpecCostFlag = (typeof SPEC_COST_FLAGS)[number];

export interface SpecCostArgs {
  readonly mode: SpecCostMode;
  /** The one suite to act on, or undefined for all of them */
  readonly only: string | undefined;
  /** Repo-relative spec paths, which name both the suite they belong to and the half that measures them */
  readonly named: readonly string[];
  readonly force: boolean;
  readonly all: boolean;
  /** Throw away every window and start again from this run. Needs `all`; see `forgetsWindows` */
  readonly forget: boolean;
  readonly dry: boolean;
}

export function parseArgs(argv: readonly string[], suiteDirs: readonly string[]): SpecCostArgs {
  const has = (name: SpecCostFlag): boolean => argv.includes(`--${name}`);
  const suites = `They are:\n  ${suiteDirs.join('\n  ')}`;

  // First, because a typo is otherwise reported as whatever the rest makes of it: `--sute repo-checks` reads
  // as a path in no suite, and `--drry` as nothing at all. `--suite=x` lands here too, this reading the
  // value as the next argument rather than after an `=`
  const strange = argv.filter((arg) => arg.startsWith('--') && !SPEC_COST_FLAGS.includes(arg.slice(2) as SpecCostFlag));
  if (strange.length > 0) {
    throw new Error(`No such flag: ${strange.join(', ')}. They are:\n  ${SPEC_COST_FLAGS.map((flag) => `--${flag}`).join('\n  ')}`);
  }

  // Read by index, not by value: the value is skipped from `named` below by its position, so a positional
  // argument that happens to read like a suite name is still a path rather than silently the flag's value
  const at = argv.indexOf('--suite');
  let only: string | undefined;
  if (at !== -1) {
    const value = argv[at + 1];
    // A trailing `--suite` reads as undefined, which would skip the check below and mean every suite —
    // the expensive direction, since `--all --suite` then measures all of them
    if (value === undefined || value.startsWith('--')) throw new Error(`\`--suite\` needs a suite after it. ${suites}`);
    if (!suiteDirs.includes(value)) throw new Error(`No suite "${value}". ${suites}`);
    only = value;
  }

  const named = argv.filter((arg, index) => !arg.startsWith('--') && !(at !== -1 && index === at + 1));
  const unknown = named.filter((file) => !suiteDirs.some((dir) => file.startsWith(`packages/${dir}/`)));
  if (unknown.length > 0) {
    throw new Error(`These are in no unit suite, so nothing measures them:\n  ${unknown.join('\n  ')}\n`
      + 'Name a spec by its repo-relative path, as `packages/<suite>/tests/<file>.spec.ts`.');
  }

  const all = has('all');
  if (all && named.length > 0) {
    throw new Error(`--all measures every spec and naming ${named.join(', ')} asks for one; they contradict. `
      + 'Drop --all to measure that spec\'s half, or drop the path to re-measure everything.');
  }
  if (only !== undefined) {
    const outside = named.filter((file) => !file.startsWith(`packages/${only}/`));
    if (outside.length > 0) {
      throw new Error(`--suite ${only} and these paths name different suites, so nothing would be measured:\n`
        + `  ${outside.join('\n  ')}\n`
        + `Drop --suite, or name paths inside packages/${only}/.`);
    }
  }

  // **It takes a scope rather than demanding the widest one.** Requiring `--all` would make correcting one
  // spec mean discarding every window in the repo, which is the reason someone reaches for the widest flag when
  // the narrow thing was wanted. The objection it would rest on — that a partial forget leaves the record
  // holding two vintages — does not hold: a record already does, by design, since `--all` appends only where a
  // reading disagrees and a bare update measures only what the check would report. One `measuredAt` was never a
  // claim that every window was taken together.
  //
  // So it refuses a forget that would reach nothing. The scopes that *measure* are `--all` — narrowed by
  // `--suite` if given — and a named path; a bare update measures only what the check would report, so
  // `--forget --suite x` on a current record silently forgets nothing, and a spec it does measure is new and
  // written fresh whether or not this was asked for. Forgetting needs a reading to replace the window with.
  const forget = has('forget');
  if (forget && !all && named.length === 0) {
    throw new Error('--forget replaces recorded readings with this run\'s, so it needs a scope that measures: '
      + '--all (with --suite to narrow it), or a spec path. On its own, or with --suite alone, it would '
      + 'measure nothing and so forget nothing.');
  }

  return {
    mode: has('list') ? 'list' : has('update') ? 'update' : 'check',
    only, named, force: has('force'), all, forget, dry: has('dry'),
  };
}

/**
 * The suites an invocation acts on.
 *
 * One function for all three modes, because `--suite` and a named path each narrow the population and every
 * mode has to narrow it the same way. It also holds the invariant: **given arguments `parseArgs` accepted,
 * this never selects nothing.** Undo that and `update` reports "every record is current" over a population
 * it never looked at, which is a green run over no work at all.
 */
export function suitesFor(
  suiteDirs: readonly string[], only: string | undefined, named: readonly string[],
): string[] {
  return suiteDirs
    .filter((dir) => only === undefined || dir === only)
    .filter((dir) => named.length === 0 || named.some((file) => file.startsWith(`packages/${dir}/`)));
}

/** The named specs, relative to their suite, for the one suite they are in */
export const namedIn = (dir: string, named: readonly string[]): string[] => named
  .filter((file) => file.startsWith(`packages/${dir}/`))
  .map((file) => file.slice(`packages/${dir}/`.length));

/** Named specs that are not on disk, which nothing can measure or judge */
export const absentIn = (files: readonly string[], named: readonly string[]): string[] =>
  named.filter((file) => !files.includes(file));

/**
 * Named paths that name no spec, across every suite they reach into.
 *
 * The command validates with this, once, before it reads a record — because a typo is the caller's mistake and
 * has nothing to do with which suite it lands in. Validated inside a mode's per-suite loop instead, a run
 * reports the first suite's typo and the second only once you have fixed that one; and `check`, which
 * accumulates every other kind of problem across all twelve suites before reporting, would contradict itself.
 *
 * Returns the paths as the caller wrote them. The early return for an unnamed run is a cost guard — without
 * it every bare invocation walks twelve trees to answer a question nobody asked.
 */
export function absentNamed(repoRoot: string, suiteDirs: readonly string[], named: readonly string[]): string[] {
  if (named.length === 0) return [];
  // Sorted, because the order this is read in is the reader's: unsorted it comes back in `suiteDirs` order,
  // which is the unit-suite list's, and a caller's three typos then print in an order nothing on screen
  // explains. Everything else here that a person reads is sorted too
  return suitesFor(suiteDirs, undefined, named).flatMap((dir) => {
    const files = specFiles(path.join(repoRoot, 'packages', dir));
    return absentIn(files, namedIn(dir, named)).map((file) => `packages/${dir}/${file}`);
  }).sort();
}

/**
 * Refuse a named spec that does not exist, so that `planFor` cannot plan a run for one.
 *
 * A path is otherwise only checked for its `packages/<suite>/` prefix, so a typo maps to a half by its
 * extension and the run measures that whole config, records nothing for the file named, and reports
 * "none moved".
 *
 * The command cannot reach this: it validates every named path with `absentNamed` before it reads anything.
 * That makes this an assertion rather than a gate — it holds for a caller reaching `planFor` directly, which
 * the specs do, and what would make it fire from the command is `absentNamed` being dropped from the tail.
 */
export function refuseAbsent(dir: string, files: readonly string[], named: readonly string[]): void {
  const absent = absentIn(files, named);
  if (absent.length === 0) return;
  throw new Error(`These are not specs in ${dir}:\n  ${absent.map((file) => `packages/${dir}/${file}`).join('\n  ')}\n`
    + 'Nothing would measure them, so this would run a config and record nothing.');
}


/**
 * Whether this run should throw away every window and start again from what it just measured.
 *
 * **The one thing a window cannot do for itself: forget.** A window is deliberately slow to be convinced,
 * which is right for a noisy reading and wrong for a correlated drift — a bundler bump that adds a fifth to
 * every spec is real, is uniform, and would otherwise take a second agreeing run per row to be believed
 * while every answer in the file is stale. Forgetting is how you say "the old readings describe code that
 * is gone".
 *
 * **`--all --forget`, and a flag of its own rather than riding on `--force`.** It was `all && force` for one
 * commit, on the reasoning that taking a record over and declaring its history void are one operation. They
 * are not: `adopt` answers *whose machine the record is* and this answers *whether its readings still describe
 * the code*, and someone on the record's own machine after a bundler bump needs the second with no reason to
 * touch the first. Worse, `--force` is what overrides `refusesAsBusy` and `refusesAsContended` — so the write
 * that discards every window and sets each cost from a single reading, the state with no history to outvote a
 * bad one, was the only one that could not be refused for a loud machine. Both refusals apply under
 * `--forget`, which is the point of separating them.
 *
 * `--all` on its own re-measures everything and *appends*, which is the ordinary case and keeps the
 * protection. `parseArgs` refuses `--forget` without it.
 *
 * It replaced `rewritesEveryRow`, which was `all && drifted(body)` — a drift gate on a write, from when
 * the record held one number per spec and rewriting it on a quiet run was the churn the tolerance existed
 * to prevent. A window has no such problem: an agreeing reading is not kept at all, so there is nothing
 * for a drift threshold to protect and the flag can mean what it says.
 */
export const forgetsWindows = (input: { readonly all: boolean; readonly forget: boolean }): boolean =>
  input.all && input.forget;

/** What one suite needs doing, worked out from the record before anything runs */
export interface SpecCostPlan {
  /** The configs to measure. Empty means nothing needs measuring. */
  readonly configs: readonly string[];
  /** Recorded specs that no longer exist, which need no measurement to drop */
  readonly prune: readonly string[];
  readonly reason: string;
}

/**
 * The least that makes a suite's record current.
 *
 * Read from the same three questions the check asks, so the command and the check cannot disagree about
 * what is wrong. A misplaced spec is deliberately not among them: its fix is renaming the file into the
 * other half, which no update can do for you.
 */
export function planFor(repoRoot: string, dir: string, named: readonly string[], all: boolean): SpecCostPlan {
  const packageDir = path.join(repoRoot, 'packages', dir);
  const files = specFiles(packageDir);
  const previous = readSpecCost(repoRoot, dir);
  const prune = previous === undefined ? [] : stale(previous, files);

  refuseAbsent(dir, files, named);

  if (all) return { configs: configsFor(packageDir), prune, reason: 'every spec, asked for' };
  if (named.length > 0) return { configs: configsOf(packageDir, named), prune, reason: `${named.length} named` };

  const needs = previous === undefined ? files : unrecorded(previous, files);
  if (needs.length > 0) return { configs: configsOf(packageDir, needs), prune, reason: `${needs.length} unmeasured` };
  return { configs: [], prune, reason: prune.length > 0 ? `${prune.length} gone` : 'current' };
}

export interface Settled extends Changes {
  readonly record: SpecCost;
  /**
   * Specs that had a cost and no longer do, other than the pruned ones a caller already reports.
   *
   * The third way a record's costs can differ, after a value moving and a spec arriving — and the one a
   * report that enumerates the first two misses, since a spec that stops running rewrites the file.
   */
  readonly dropped: readonly string[];
}

/**
 * The record a run produces from the one it is replacing.
 *
 * Separate from the measuring so that it can be watched: what a run does to a record is the half with the
 * decisions in it, and it used to sit inline behind a `measure()` that spawns vitest, where no case could
 * reach it.
 *
 * `measuredAt` moves when the content does, **compared against the previous record rather than derived from
 * a list of the reasons it might have changed** — a record nothing moved is byte-identical, so an update that
 * found nothing leaves no diff to read past. Enumerating the reasons is what to undo this back into: costs
 * moving, specs arriving and rows pruned are three, a spec that stops running is a fourth, and a list of
 * them is wrong every time someone adds a fifth without noticing there was a list.
 */
export function settle(input: {
  readonly previous: SpecCost | undefined;
  readonly costs: Record<string, number>;
  readonly skipped: readonly string[];
  /** The specs the chosen configs run, which is what makes a recorded skip this run's to drop */
  readonly measuredFiles: readonly string[];
  readonly prune: readonly string[];
  /**
   * Throw away every window and start again from what this run measured.
   *
   * What `forgetsWindows` decides, which is `--all --forget`. It is how a correlated drift is cleared: the
   * old readings describe code that is gone, so appending to them would make the window argue with itself
   * for a run.
   */
  readonly forgetWindows: boolean;
  /** Take the record over: write this machine as its own. `--all --force` off the record's machine */
  readonly adopt?: boolean;
}): Settled {
  const { previous, costs, measuredFiles, prune, forgetWindows } = input;
  const kept = Object.entries(previous?.samples ?? {}).filter(([spec]) => !prune.includes(spec));

  // A reading joins the window only when it says something the window does not already say: it disagrees with
  // the median, or it lands in the other half. An agreeing one is dropped, which is what keeps a quiet run
  // free of a diff; a kept one does not move the median by itself, and the second that agrees with it does.
  // `worthKeeping` carries the measured reasoning for both halves of that.
  const settled: Record<string, readonly number[]> = Object.fromEntries(kept);
  for (const [spec, ms] of Object.entries(costs)) {
    const before = previous?.samples[spec];
    settled[spec] = forgetWindows || before === undefined ? [ms]
      : worthKeeping(spec, costOf(before), ms) ? appendSample(before, ms) : before;
  }

  // Against `costs`, which is what this run measured — not against the settled values, which still hold
  // everything the record had. A spec that had a cost and is now wholly skipped is the case that separates
  // them: it has no measurement, so it must lose the cost it had rather than keep it beside its own skip.
  const nowSkipped = input.skipped.filter((file) => costs[file] === undefined);
  for (const file of nowSkipped) delete settled[file];

  const keptSkipped = (previous?.skipped ?? []).filter((file) => !prune.includes(file) && !measuredFiles.includes(file));
  const skipped = [...new Set([...keptSkipped, ...nowSkipped])].sort();
  const sorted = Object.fromEntries(Object.entries(settled).sort(([a], [b]) => a.localeCompare(b)));

  // A spec this run priced or found wholly skipped is no longer unmeasured, whichever list it moved into.
  // Pruned ones leave as they do everywhere else.
  const unmeasured = (previous?.unmeasured ?? []).filter((file) => !prune.includes(file)
    && sorted[file] === undefined && !skipped.includes(file));

  const same = previous !== undefined
    && Object.keys(previous.samples).length === Object.keys(sorted).length
    && Object.entries(sorted).every(([spec, window]) =>
      JSON.stringify(previous.samples[spec]) === JSON.stringify(window))
    && previous.skipped.length === skipped.length
    && previous.skipped.every((file, index) => skipped[index] === file)
    && previous.unmeasured.length === unmeasured.length
    && previous.unmeasured.every((file, index) => unmeasured[index] === file);

  return {
    ...changesIn(previous, settled, costs),
    dropped: Object.keys(previous?.samples ?? {}).filter((spec) => sorted[spec] === undefined && !prune.includes(spec)),
    // The machine is the record's own, and a first record is this one's. Changing it is adopting the record,
    // which `--all --force` is: see `update` in `scripts/spec-cost.ts`.
    record: withCosts({
      measuredAt: same ? previous.measuredAt : new Date().toISOString(),
      samples: sorted,
      skipped,
      unmeasured,
      machine: input.adopt || previous === undefined ? thisMachine() : previous.machine,
    }),
  };
}
