/**
 * What every unit suite's specs cost, and the check that each one is where its cost puts it.
 *
 *     npm run spec-cost:check                      # reads the records; runs nothing
 *     npm run spec-cost:check -- --list            # what they hold, and which specs sit in the band
 *     npm run spec-cost:update                     # the least that makes them current
 *     npm run spec-cost:update -- <spec path>      # that spec's half, nothing else
 *     npm run spec-cost:update -- --suite <dir>    # one suite
 *     npm run spec-cost:update -- --all            # re-measure everything, and re-record it if it drifted
 *     npm run spec-cost:update -- --dry            # what it would run and write
 *
 * **A bare update does the least that clears what the check would report**, which is often nothing: a
 * deleted spec leaves a row that needs no measurement to drop, and a new spec needs only the half it lives
 * in. It says which case it took.
 *
 * **Three flags, three different things, and none of them is a threshold on the write.** `--all` re-measures
 * every spec and *appends* what disagrees, so a quiet run still writes nothing and the history that rejects a
 * noisy reading is kept. `--forget` (with `--all`) throws that history away and starts again from this run,
 * which is what clears a *correlated* drift — one that adds a fifth to every spec sits under every per-spec
 * tolerance, so appending to the old readings would have the window argue with itself for a run. **Nothing
 * here reports such a drift any more**, for the reason recorded beside `forgetWindows` below: the detector
 * fired on one file's noise in five of the twelve suites. So the flag is for a change you already know about
 * — a bundler bump, a worker-cap change — and the figure it protected carries its own `measuredAt`.
 * `--force` overrides the two refusals, the idle floor and the contention check, and nothing else.
 *
 * **Naming a spec selects its config, never the file alone.** A spec measured on its own is not comparable
 * to one measured beside its siblings — `chain-inputs` reads 1688ms in its config and 963ms alone, against a
 * band 1000ms wide — so the unit of measurement stays the config the recorded numbers came from. The saving
 * is the other half: repo-checks is 8.1s of fast specs behind 34.2s of integration ones.
 *
 * The check runs nothing on purpose. Re-measuring to decide placement would make the cheap half expensive,
 * which is the thing the split exists to avoid — so the record is the authority between updates, and the
 * update is the deliberate act. `scripts/lib/spec-cost.ts` holds what this and `suite-split.spec.ts` share,
 * so a spec and this command cannot disagree about where a file belongs.
 *
 * Run the update with nothing else on the machine. A contended run records a cost that is about the
 * machine, and a spec near an edge then moves for no reason anyone can see later. It is refused when it
 * shows, whatever flags it carries (`refusesAsContended`), and `--force` is how you say the suite really
 * did change that much.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { idleNow, RECORD_IDLE_FLOOR, refusesAsBusy, refusesAsContended } from './lib/measure.ts';
import { isMeasuredMachine, machineText, thisMachine, type Machine } from './lib/core-budget.ts';
import { UNIT_SUITES, type UnitSuite } from './lib/unit-suites.ts';
import { POOLS, type Pool } from './lib/unit-pool.ts';
import {
  CONTENTION_RATIO_MAX, COST_ACCURACY, FAST_BELOW_MS, INTEGRATION_ABOVE_MS, PLACEMENT_GUARD, describeBudget,
  ratiosFromMoves, underBound,
  nearEdge, overBudget,
  absentNamed, forStorage, namedIn, parseArgs, planFor, readSpecCost, recordMembership,
  writesMembershipOnly,
  readingsText,
  type SpecCost, type StoredSpecCost,
  pendingHere, provisional, forgetsWindows, recordedVerdict, settle, specCostFile, specFiles, stale, suiteCounts,
  suitesFor, unrecorded, type SpecCostPlan,
} from './lib/spec-cost.ts';
import { CONFIG_BY_HALF, halfOfPath, hasSplit } from './lib/spec-halves.ts';

const packageDir = (suite: UnitSuite): string => path.join(REPO_ROOT, 'packages', suite.dir);

interface Measured { costs: Record<string, number>; skipped: string[] }

/** A file's entry in vitest's JSON reporter. `duration` is not a field — it is `endTime - startTime`. */
interface ReportedFile {
  readonly name: string;
  readonly status: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly assertionResults?: readonly { readonly status: string }[];
}

/** The statuses a test carries when it ran. Anything else is a skip, a todo or pending. */
const RAN = new Set(['passed', 'failed']);

/**
 * A spec's cost, measured by **the pool that actually runs it**.
 *
 * This used to run one `npx vitest` per package, which measured eleven of the twelve suites in an
 * environment they never run in: the host suites share one pooled vitest across eleven projects and the
 * integration halves share another, so a spec measured alone competes with nothing. Only the pack pool,
 * which invokes `npm test -w` per suite, was measured where it runs.
 *
 * The cost of that was not theoretical. Measured 2026-10-05 over three runs,
 * `abuddy-cli/tests/commands/run-install.spec.ts` was recorded at 1317ms and read 3106-3297ms pooled —
 * over `INTEGRATION_ABOVE_MS`, in a package that has an integration half to move it to — and the audit
 * passed on the recorded number. `chain-inputs` reading 1688ms beside its siblings and 963ms alone was
 * already in this file's own comments as the reason a spec must be measured with its config; the pool is
 * the same argument one level out.
 *
 * So the measurement goes through `POOLS` (`scripts/lib/unit-pool.ts`), which is where how-a-pool-runs is
 * declared once and which `test-unit-pool.ts` uses to run them. There is no second description of a pool
 * here to drift from that one: the command this spawns is the command the suite runs under.
 *
 * Attribution is by absolute path from the JSON reporter rather than by parsing the human one. The default
 * reporter prefixes `|project|` in a pooled run and nothing in a per-package run, so reading it meant
 * handling both and tracking npm's banner lines to know which suite a prefix-less line belonged to; a path
 * says which package it is. The human reporter is still asked for, so what a developer sees is unchanged.
 */
function measurePools(plans: readonly SuitePlan[]): Map<string, Measured> {
  const byDir = new Map<string, Measured>();
  const entry = (dir: string): Measured => {
    const found = byDir.get(dir) ?? { costs: {}, skipped: [] };
    byDir.set(dir, found);
    return found;
  };

  for (const kind of Object.keys(POOLS) as Pool[]) {
    const pool = POOLS[kind];
    const config = CONFIG_BY_HALF[pool.half];
    const mine = new Set(pool.suites().map((suite) => suite.dir));
    const wanted = plans.filter((plan) => mine.has(plan.suite.dir) && plan.configs.includes(config));
    if (wanted.length === 0) continue;

    // **The pool runs whole, even when one suite asked for it.** Handing it only the stale projects would
    // measure them alone again, which is the defect this function exists to fix — a project competes with
    // the ten beside it or the number is not the one the suite runs at. The readings for suites that asked
    // for nothing are discarded by the caller, which settles only the plans it had work for.
    //
    // So a one-spec update costs a pool run (tens of seconds) where it used to cost a package run (a few).
    // That is the price of a faithful number, and it is paid by a command that is run rarely and whose
    // whole output is a measurement.
    for (const { suites, command, args } of pool.run(pool.suites())) {
      const out = path.join(os.tmpdir(), `abuddy-spec-cost-${process.pid}-${kind}-${suites[0]!.dir}.json`);
      // Both reporters: the JSON is what this reads and the default is what the caller watches. `npm` needs
      // `--` before flags meant for the script it runs; the other pools spawn vitest directly.
      const extra = ['--reporter=default', '--reporter=json', `--outputFile=${out}`];
      const result = spawnSync(command, command === 'npm' ? [...args, '--', ...extra] : [...args, ...extra],
        { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
      const shown = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      const named = suites.map((suite) => suite.workspace).join(', ');
      if (!fs.existsSync(out)) {
        throw new Error(`the ${kind} pool wrote no report for ${named}; a cost cannot be read from it.\n${shown.slice(-4000)}`);
      }
      const reported = (JSON.parse(fs.readFileSync(out, 'utf-8')) as { testResults?: readonly ReportedFile[] }).testResults ?? [];
      fs.rmSync(out, { force: true });

      const partial: string[] = [];
      const failed: string[] = [];
      for (const file of reported) {
        const within = /^packages[/\\]([^/\\]+)[/\\](.+)$/.exec(path.relative(REPO_ROOT, file.name));
        if (within === null) continue;
        const [, dir, spec] = within as unknown as [string, string, string];
        const found = entry(dir);
        const statuses = new Set((file.assertionResults ?? []).map((test) => test.status));
        if (file.status === 'failed') failed.push(spec);
        if (![...statuses].some((status) => RAN.has(status))) {
          // No test in it ran, so vitest reports no useful time: the same case the default reporter showed
          // by printing a file line with no duration at all
          found.skipped.push(spec);
          continue;
        }
        found.costs[spec] = Math.round(file.endTime - file.startTime);
        // A file that ran some of its tests and skipped the rest has a cost that understates it, which is
        // worse than having none — it would be placed on a number that is not what the file does.
        if ([...statuses].some((status) => !RAN.has(status))) partial.push(`${dir}/${spec}`);
      }

      // A cost measured from a failing run is not a cost — with one exception, the guard that reads the
      // record this command is replacing. While the record is stale it fails, and skipping it instead would
      // leave it with no measured cost at all, so it runs, fails, and is measured like everything else.
      if (result.status !== 0 && failed.filter((spec) => spec !== PLACEMENT_GUARD).length > 0) {
        throw new Error(`the ${kind} pool failed for ${named}; a cost measured from a failing run is not a cost.\n${shown.slice(-4000)}`);
      }
      if (partial.length > 0) {
        throw new Error(`the ${kind} pool skipped some tests in ${partial.join(', ')}; that file's cost understates `
          + 'it. Fix the skip, then re-measure.');
      }
    }
  }
  return byDir;
}

/** A suite's plan, with the suite it is for. `planFor` decides the plan; this carries what prints it. */
interface SuitePlan extends SpecCostPlan { readonly suite: UnitSuite }

function describe(plan: SuitePlan): string {
  const doing = [
    plan.configs.length > 0 ? `measure ${plan.configs.join(' + ')}` : '',
    plan.prune.length > 0 ? `drop ${plan.prune.length}` : '',
  ].filter(Boolean).join(', ') || 'nothing';
  return `${plan.suite.workspace.padEnd(20)} ${doing.padEnd(46)} (${plan.reason})`;
}

/** Written only when the bytes differ, so an unchanged record leaves no diff */
/**
 * The record as it is written, with each window on one line.
 *
 * `JSON.stringify(_, null, 2)` puts every reading on its own line, which is four lines per spec for a
 * window of one and turns a 45-row record into 180 lines. These files are read in diffs — the whole reason
 * a quiet run writes nothing is that someone reviews the ones that do — so the windows are collapsed back
 * onto one line each. Numbers only, so nothing here has to think about escaping.
 */
const recordJson = (record: StoredSpecCost): string =>
  JSON.stringify(record, null, 2).replace(/\[\n\s*((?:\d+,\n\s*)*\d+)\n\s*\]/g,
    (_, readings: string) => `[${readings.split(',').map((reading) => reading.trim()).join(', ')}]`);

function writeRecord(dir: string, record: SpecCost): void {
  const file = path.join(REPO_ROOT, specCostFile(dir));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // `forStorage`, because the costs are derived: writing them would put a second record of one fact in the
  // file, where the two can disagree and the stale one is the authoritative-looking one
  const next = `${recordJson(forStorage(record))}\n`;
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') !== next) fs.writeFileSync(file, next);
}

function update(plans: readonly SuitePlan[], dry: boolean): void {
  // "Every record is current" is a claim about the suites this looked at, so it must have looked at one.
  //
  // Unreachable as written — `parseArgs` refuses the arguments that used to empty this list and `suitesFor`
  // carries the case — and kept because what makes it reachable again is a *narrowing added below*, where no
  // case can see it. Append `.filter(() => false)` to the chain that builds `plans` and every spec still
  // passes: this is the only thing that turns that into a failure instead of a green run over no work.
  if (plans.length === 0) throw new Error('No suite was selected, so there is nothing to report on.');

  const work = plans.filter((plan) => plan.configs.length > 0 || plan.prune.length > 0);
  if (work.length === 0) {
    console.log('✅ every record is current — nothing to measure. `--all` re-measures anyway.');
    return;
  }
  if (dry) {
    console.log(`spec-cost:update — ${work.length} suite${work.length === 1 ? '' : 's'} (--dry, writing nothing)\n`);
    for (const plan of work) console.log(`  ${describe(plan)}`);
    console.log('\nRun without --dry to do it.');
    process.exit(1);
  }

  const adopt = all && force;
  /**
   * The suites that will actually take a reading, which is **not** every suite with work to do.
   *
   * A suite whose record belongs to another machine writes membership and measures nothing (the branch in
   * the loop below), so the two gates under this have no subject for it: there is no sample to be spoiled
   * by a busy box, and nothing to build for. Asked of `plan.configs` alone, the refusal fired first and
   * unconditionally — a second developer adding a spec on a working machine was refused for a write that
   * takes no measurement, which is a refusal with nothing to refuse.
   */
  const measuring = work.filter((plan) => {
    if (plan.configs.length === 0) return false;
    const previous = readSpecCost(REPO_ROOT, plan.suite.dir);
    return previous === undefined || !writesMembershipOnly(previous, { adopt });
  });

  /**
   * **A busy box records membership and no cost. It does not wait, and it does not refuse.**
   *
   * Two earlier versions of this were worse in opposite directions. It threw, which blocked a landing:
   * `suite-split` fails on a spec the record has never seen, so a box that stayed under the floor left the
   * gate red with the only advice being to wait. Then it waited up to ten minutes before throwing, which
   * removed a round trip and left the block in place for anyone whose machine stayed busy.
   *
   * Degrading makes both unnecessary. The record holds two kinds of thing with different permissions —
   * *which specs exist* is a fact about the repo, *what one costs* is a fact about a machine — and a busy
   * machine can still see the first. So it takes the path another machine takes: the spec is listed
   * `unmeasured`, which `unrecorded` accepts, and the next quiet run prices it. There is nothing left for a
   * wait to buy: the cost it would eventually take is the cost that run takes anyway.
   *
   * Nothing is lost. The refusal existed to keep a busy box's numbers out of the record, and writing no cost
   * does that better than writing none *and* failing. Placement is unaffected either way, since a spec runs
   * in the half its filename says (`halfOfPath`) and the cost only audits that. `--force` measures anyway.
   */
  let busy: string | undefined;
  if (measuring.length > 0) {
    const idle = idleNow();
    if (refusesAsBusy({ idle, floor: RECORD_IDLE_FLOOR, force })) {
      busy = `${Math.round(idle * 100)}% idle, below the ${Math.round(RECORD_IDLE_FLOOR * 100)}% a cost needs`;
    }
  }

  // What each suite's `pretest` does, because this bypasses it by calling vitest directly. Without it the
  // specs fail on the staleness guard rather than running. Skipped when nothing is being measured.
  if (measuring.length > 0 && busy === undefined) {
    const ensured = spawnSync('npm', ['run', 'packages:ensure'], { cwd: REPO_ROOT, encoding: 'utf8' });
    if (ensured.status !== 0) throw new Error(`packages:ensure failed:\n${ensured.stdout}${ensured.stderr}`);
  }

  // Measured here rather than inside the loop below, because a pool runs its suites *together* and that is
  // the whole point of `measurePools`: one run per pool, not one per suite. The loop then settles each
  // suite from what its pool read.
  const pooled = measuring.length > 0 && busy === undefined ? measurePools(measuring) : new Map<string, Measured>();

  for (const plan of work) {
    const { suite } = plan;
    const dir = packageDir(suite);
    const files = specFiles(dir);
    const previous = readSpecCost(REPO_ROOT, suite.dir);

    // **A machine that is not the record's writes membership and never a cost.**
    //
    // The record holds two kinds of thing, and they need different permissions: *which specs exist* is a
    // fact about the repo that anyone can see, and *what one costs* is a fact about a machine. They were one
    // map until 2026-10-03, so adding a spec meant measuring it — and the only way a second developer could
    // satisfy the `unmeasured` finding was to write their own box's milliseconds into a record measured on
    // someone else's, mixing two machines in one file with nothing saying so.
    //
    // `--all --force` is how a machine takes the record over: re-measure the whole thing and write this
    // machine as its own. Two flags rather than a third, because that is exactly what adoption is — every
    // row re-measured (`--all`) past a refusal that exists to stop a partial one (`--force`).
    if (previous !== undefined && writesMembershipOnly(previous, { adopt, busy })) {
      const next = recordMembership(previous, files);
      const added = next.unmeasured.filter((file) => !previous.unmeasured.includes(file));
      const gone = stale(previous, files);
      writeRecord(suite.dir, next);
      // Two reasons reach here and they are not the same fact: whose machine the costs are, and whether this
      // one is quiet enough to add to them. Saying which it was is the difference between "ask the other
      // developer" and "run it again later".
      const why = busy !== undefined
        ? `${busy} — a quiet run prices them, or --force measures anyway`
        : `costs are ${machineText(previous.machine)}'s and this is ${machineText(thisMachine())}`;
      console.log(`${suite.workspace.padEnd(21)} ${
        added.length === 0 && gone.length === 0
          ? 'membership is current'
          : `${added.length} unmeasured, ${gone.length} gone`
      } — ${why}`);
      continue;
    }

    // A suite with no record at all cannot have membership added to it, so a busy box has nothing to fall
    // back to and the refusal stands. Only a new suite reaches this.
    if (previous === undefined && busy !== undefined) {
      throw new Error(`${suite.workspace} has no record yet, and this machine is ${busy}. A first record is all `
        + 'cost, so there is no membership to write without measuring: run it on a quiet machine, or --force.');
    }

    // Only the specs the chosen configs actually run. Every guard below is scoped to these: over the whole
    // suite they would each fire on a file this run never claimed to measure.
    const measuredFiles = files.filter((file) => plan.configs.includes(CONFIG_BY_HALF[halfOfPath(file)]));
    const read = pooled.get(suite.dir) ?? { costs: {}, skipped: [] };
    const costs = read.costs;

    // **No body-drift report here, and that is a decision rather than an omission.** `bodyDrift` asks
    // whether a suite's total moved further than idle runs vary, on the premise that jitter cancels in a
    // sum. Measured 2026-10-05 across all twelve records, that premise does not hold here: five suites have
    // a single spec at 64% or more of their body (`@abuddy/ui` 93%, `main` 89%, `@abuddy/sdk` 86%), and the
    // worst single spec moves 74% between two quiet runs, so on those suites the report cannot avoid firing
    // on one file's noise. Observed the same day: +16% and -14% on one run, opposite directions.
    // What it protected is an advisory total that `spec-dry.ts` says is "deliberately allowed to sit up to
    // `DRIFT_SHARE` from the truth", and staleness of that figure is carried by the `measuredAt` which
    // `spec:dry` prints beside it. `bodyDrift` keeps its one caller, the chain, whose steps are the subject
    // its threshold was measured on. Re-adding it here needs a detector that tells one spec from the body.
    const forgetWindows = forgetsWindows({ all, forget });
    const { record, added, moved, appended, dropped } = settle({
      previous, costs, skipped: [...new Set(read.skipped)], measuredFiles,
      prune: plan.prune, forgetWindows, adopt,
    });

    // What a sample can check: not equality, which it never has, but reproducibility. An idle run moves a
    // handful; a contended one moves most of what it could move and records the machine instead of the specs.
    // Only specs that had a value to move are evidence of that — a first measurement is not.
    const comparable = Object.keys(costs).length - added.length;
    if (refusesAsContended({ hasPrevious: previous !== undefined, force, moved: appended.length, comparable })) {
      throw new Error(`${suite.workspace}: ${appended.length} of ${comparable} already-recorded specs read `
        + `differently from what is on record, `
        + `which is more than a measurement should. That is what a loaded machine looks like — run this with `
        + `nothing else running, or pass --force if the suite really did change this much.`);
    }

    const missing = unrecorded(record, measuredFiles);
    if (missing.length > 0) throw new Error(`These ${suite.workspace} specs ran nothing and were not reported as skipped:\n  ${missing.join('\n  ')}`);

    writeRecord(suite.dir, record);

    // A spec that just changed half measured `CONTENTION_RATIO_MAX` on the way, for free — the record held
    // what it cost in the half it left and this run read what it costs now. That constant is a sample with
    // nothing to re-derive it from, so a move following this gate's own advice is the only evidence that
    // arrives on its own, and a ratio past the bound means the band is too narrow again.
    const ratios = ratiosFromMoves(previous, costs, added, files);
    for (const { spec, fast, integration, ratio } of ratios) {
      const over = ratio > CONTENTION_RATIO_MAX;
      console.log(`  ${spec} changed half: ${fast}ms fast against ${integration}ms integration, ${ratio.toFixed(2)}x`
        + (over ? ` — past CONTENTION_RATIO_MAX (${CONTENTION_RATIO_MAX}x)` : ''));
    }
    if (underBound(ratios)) {
      console.log(`  A move cost more than the band covers, so a spec there can be told to move both ways.`
        + ` Re-measure and raise CONTENTION_RATIO_MAX in scripts/lib/spec-cost.ts, which lowers FAST_BELOW_MS`
        + ` with it — the floor is the cheapest integration-half spec.`);
    }

    // `measuredFiles`, not `files`: over the whole suite this reports on specs the run never measured,
    // which is the same narrowing every other guard on this path already takes
    const budget = describeBudget(overBudget(dir, record.samples, measuredFiles), suite.dir);
    // Every way the record can differ from the one it replaced, for the same reason `settle` compares rather
    // than enumerates: a change nobody listed reads as "none moved" over a rewritten file, and a spec that
    // stops running is exactly that.
    const did = [
      plan.configs.length === 0 ? 'measured nothing'
        : [
          added.length > 0 ? `${added.length} added` : '',
          moved.length > 0 ? `${moved.length} moved` : '',
          // A reading kept whose median did not move: the first of the two a change needs. Counted apart
          // from the movements rather than summed with them, because one word for both reads a run that
          // merely noticed something as a suite that has got slower.
          appended.length > moved.length ? `${appended.length - moved.length} noted` : '',
          dropped.length > 0 ? `${dropped.length} stopped running` : '',
        ].filter(Boolean).join(', ') || 'none moved',
      plan.prune.length > 0 ? `${plan.prune.length} gone` : '',
    ].filter(Boolean).join(', ');
    console.log(`${suite.workspace.padEnd(20)} ${String(files.length).padStart(3)} specs${record.skipped.length ? `, ${record.skipped.length} skipped` : ''}`
      + `, ${did} -> ${specCostFile(suite.dir)}${budget.tail ? `  (${budget.tail})` : ''}`);
    for (const line of budget.lines) console.log(line);
    if (budget.advice) console.log(budget.advice.split('\n').map((line) => `  ${line}`).join('\n'));
    for (const spec of measuredFiles) {
      const soon = provisional(spec, record.samples[spec] ?? []);
      if (soon === undefined) continue;
      console.log(`  ${soon.file} read ${soon.reading}ms against a median of ${soon.median}ms, which is`
        + ` ${soon.belongs}. One more reading that agrees moves it; nothing has to be done now.`);
    }
  }
}

/**
 * Whether the record is current, for the whole tree or for the specs named.
 *
 * A named spec narrows what is judged, as `--suite` narrows which suites are read. Both have to narrow, or
 * a path is validated and then dropped and `check <path>` answers about all twelve suites instead.
 */
function check(only: string | undefined, named: readonly string[]): void {
  const dirs = suitesFor(UNIT_SUITES.map((suite) => suite.dir), only, named);
  const suites = UNIT_SUITES.filter((candidate) => dirs.includes(candidate.dir));
  /** What an update can fix: a cost it can measure, or a row it can drop */
  const problems: string[] = [];
  /** What it cannot: a spec whose filename puts it in the other half from its cost */
  const renames: { line: string; machine: Machine; readings: number }[] = [];
  const soon: string[] = [];
  /** The same findings from a record measured on another machine, which are reported and not enforced */
  const elsewhere: { line: string; machine: Machine; readings: number }[] = [];
  /**
   * The suites whose placement went unenforced, which is not the same set as `elsewhere`.
   *
   * `elsewhere` holds *findings* a foreign record produced; this holds every suite whose record is another
   * machine's, finding or not. A tick that counted only findings would claim placement was checked for a
   * foreign record that happened to have nothing wrong with it — which is most of them.
   */
  const unenforced = new Map<string, Machine>();
  const recordable = new Set<string>();
  let total = 0;
  const parked: string[] = [];
  for (const suite of suites) {
    const dir = packageDir(suite);
    const record = readSpecCost(REPO_ROOT, suite.dir);
    if (!record) {
      problems.push(`  no ${specCostFile(suite.dir)}`);
      recordable.add(suite.dir);
      continue;
    }
    if (!isMeasuredMachine(record.machine)) unenforced.set(suite.dir, record.machine);
    const files = specFiles(dir);
    const asked = named.length > 0 ? namedIn(suite.dir, named) : files;
    total += asked.length;
    // Parked specs this box is the one to price. Beside `unrecorded` and deliberately not inside it: a
    // parked spec is *recorded*, so it is a clause on the verdict rather than a problem that throws
    for (const file of pendingHere(record, asked)) parked.push(`  ${suite.dir}/${file}`);
    const before = problems.length;
    problems.push(
      ...unrecorded(record, asked).map((f) => `  unmeasured: ${suite.dir}/${f}`),
      // Only over the whole suite: `stale` returns what the record holds and the file list does not, so
      // against a narrowed list every spec the caller did not name would read as recorded but gone
      ...(named.length > 0 ? [] : stale(record, files).map((f) => `  recorded but gone: ${suite.dir}/${f}`)),
    );
    if (problems.length > before) recordable.add(suite.dir);
    // Only `rename` gates. An `over` finding is one a package with a single half cannot act on by moving
    // anything, and whether it is *allowed* is `EXPENSIVE_BY_NATURE`'s question, which lives in
    // `suite-split.spec.ts` and not here — failing on it would fail over the entries already recorded there.
    // Only where the record's own machine is this one, for the same reason placement is: a reading that would
    // cross an edge here says nothing about a cost measured elsewhere
    if (isMeasuredMachine(record.machine)) {
      for (const file of asked) {
        const found = provisional(file, record.samples[file] ?? []);
        if (found !== undefined) {
          soon.push(`  ${found.reading}ms against a median of ${found.median}ms, which is ${found.belongs}: `
            + `${suite.dir}/${file}`);
        }
      }
    }
    for (const found of overBudget(dir, record.samples, asked)) {
      if (found.kind !== 'rename') continue;
      const line = `  ${(found.ms / 1000).toFixed(1)}s (${readingsText(found.readings)}) is ${found.belongs}, `
        + `but this is in the ${halfOfPath(found.file)} half: ${suite.dir}/${found.file}`;
      // Scoped per record, because each one names the machine it was measured on and a tree can hold two
      (isMeasuredMachine(record.machine) ? renames : elsewhere)
        .push({ line, machine: record.machine, readings: found.readings });
    }
  }
  // **Placement is read from a cost, so it gates only on the machine that measured one.** The edges are
  // milliseconds chosen for one machine's speed: on a box three times slower — inside `SLOWER_MACHINE`,
  // which is the one place this repo says how much slower a smaller machine is — 32 of the 363 fast-half specs
  // cross the upper edge and this would fail for a tree nobody has touched. Reported there rather than
  // enforced, which is `packagesBuiltOrRefuse`'s shape — evidence that does not apply is named, not acted on.
  //
  // `problems` is not scoped with it, and that is the point of splitting them: an unmeasured spec and a
  // recorded one that has gone are facts about which files exist, true on any machine, and they are the half
  // a second developer most needs. Skipping the whole command would have taken them with it.
  if (elsewhere.length > 0) {
    const measured = [...new Set(elsewhere.map((found) => machineText(found.machine)))].join(', ');
    console.log(`\nNot checking placement: these costs were measured on ${measured} and this is `
      + `${machineText(thisMachine())}, where a cost in milliseconds says nothing about which half a spec belongs in.`);
    for (const { line } of elsewhere) console.log(line);
  }
  // **The near-crossing report belongs here and not only in `update`.** It was printed by the measuring run
  // alone, which tells the one person who already knows and never the one whose chain fails three weeks later.
  // Reported rather than gated, which is `elsewhere`'s shape above: a crossing one reading away is not yet a
  // finding, and the point is that it stops being a surprise.
  if (soon.length > 0) {
    console.log(`\nOne agreeing reading from changing half, which is worth knowing before it does:`);
    for (const line of soon) console.log(line);
  }
  /**
   * **Placement is reported, never enforced — including on the machine that measured the cost.**
   *
   * It used to throw, and the reason it no longer does is a measurement rather than a preference. A spec's
   * cost is not one number: `abuddy-cli`'s `run-install` reads 2.8s in the fast pool and 0.64s in the
   * integration pool, a 4.37x move against a `CONTENTION_RATIO_MAX` of 2.5x — so it is over the upper edge
   * in one half and under the lower edge in the other, and a gate acting on either reading demands a rename
   * that the other reading immediately demands back. Measured 2026-10-05, once costs came from the pool
   * that runs a spec (`measurePools`) rather than from one vitest per package.
   *
   * That is not a spec to fix. It is what an absolute millisecond edge does to a quantity that depends on
   * which half you are asking from, and a gate cannot be right about it. So this takes `elsewhere`'s shape,
   * which the comment above states for the same reason one level weaker — evidence that cannot be acted on
   * is named, not enforced.
   *
   * **`problems` is still a gate**, and the split is the point: an unmeasured spec or a recorded one that
   * has gone is a fact about which files exist, true on any machine and fixable by one command. Only the
   * placement half depended on a number that moves.
   */
  if (renames.length > 0) {
    console.log(`\nWorth a look, not a finding: these cost more than their half allows, read from the pool `
      + 'that runs them. Whether a spec belongs in the other half is a judgement — a cost can be over the '
      + 'upper edge in one half and under the lower edge in the other.');
    for (const { line } of renames) console.log(line);
  }
  if (problems.length > 0) {
    const advice = `Run: npm run spec-cost:update${recordable.size === 1 ? ` -- --suite ${[...recordable][0]}` : ''}`;
    throw new Error(`Spec costs are out of date:\n${problems.join('\n')}\n\n${advice}`);
  }
  // **The tick says what was checked, not what the command is for.** Placement is enforced only against a
  // record this machine measured, so on any other box "in the half its cost implies" is a claim about work
  // that did not happen — and a green line carrying a false clause is how this repo came to have
  // `packagesBuiltOrRefuse`: thirteen spec files, nine of them a whole package, reported green having checked
  // nothing. The shape is the chain's own verdict, which composes an optional `(N of M cached)` clause rather
  // than printing a different sentence.
  if (parked.length > 0) {
    console.log(`\nMembership without a cost, and this is the machine that prices them:`);
    for (const line of parked) console.log(line);
    console.log('Run: npm run spec-cost:update');
  }
  console.log(recordedVerdict({
    total,
    suites: suites.length,
    named: named.length > 0,
    unenforced: unenforced.size,
    measuredBy: [...new Set([...unenforced.values()].map(machineText))].join(', '),
    here: machineText(thisMachine()),
    parked: parked.length,
  }));
}

/**
 * What the record holds, rather than whether it is current.
 *
 * The distribution is the point: 304 of 366 specs are under 500ms and never near a decision, so the few that
 * sit inside the band are the only ones whose placement a re-measurement could move. Rows before printing,
 * so a spec can assert over them without reading stdout.
 */
/** `suite` plus `suiteCounts`' five numbers, so the row and the counts cannot drift apart */
interface ListRow extends ReturnType<typeof suiteCounts> {
  readonly suite: string;
}

function list(only: string | undefined, named: readonly string[]): void {
  const dirs = suitesFor(UNIT_SUITES.map((suite) => suite.dir), only, named);
  const selected = UNIT_SUITES.filter((candidate) => dirs.includes(candidate.dir));

  // Named specs are the question itself, so the per-suite aggregate has nothing to add: what is wanted is
  // each one's cost and the half it is in
  if (named.length > 0) {
    for (const suite of selected) {
      const record = readSpecCost(REPO_ROOT, suite.dir);
      const asked = namedIn(suite.dir, named);
      for (const file of asked) {
        const ms = record?.costs[file];
        // Milliseconds below a second: this branch names whatever spec was asked for, including a cheap one,
        // which `${(ms / 1000).toFixed(1)}s` would report as `0.0s`
        const cost = ms === undefined
          ? (record?.skipped.includes(file) ? 'skipped' : 'unmeasured')
          : (ms < 1_000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
        // Distance to the edge that could move *this* spec, which depends on its half — and nothing at all
        // for a package with one half, the same question `overBudget` asks of the package
        const band = hasSplit(packageDir(suite)) && ms !== undefined && nearEdge(file, ms)
          ? '  (near its edge)' : '';
        console.log(`  ${cost.padStart(10)}  ${halfOfPath(file).padEnd(11)} ${suite.dir}/${file}${band}`);
      }
    }
    return;
  }

  const rows: ListRow[] = [];
  const near: string[] = [];
  for (const suite of selected) {
    const record = readSpecCost(REPO_ROOT, suite.dir);
    if (record === undefined) continue;
    const split = hasSplit(packageDir(suite));
    // One pass over the record for all five numbers, so this table and the check's total cannot disagree
    // about how many specs a suite has. `corroborated` is how many costs rest on more than one reading,
    // which is what says whether the window has engaged — derived here rather than written in `WINDOW`'s
    // doc, where a count would drift, and the answer has been sobering: 388 of 389 held one reading the day
    // the window landed
    const counts = suiteCounts(record, specFiles(packageDir(suite)), split);
    rows.push({ suite: suite.dir, ...counts });
    const atRisk = split ? Object.entries(record.costs).filter(([file, ms]) => nearEdge(file, ms)) : [];
    for (const [file, ms] of atRisk) {
      const edge = halfOfPath(file) === 'fast' ? INTEGRATION_ABOVE_MS : FAST_BELOW_MS;
      near.push(`  ${(ms / 1000).toFixed(1)}s  ${halfOfPath(file).padEnd(11)} ${suite.dir}/${file}`
        + `  ${Math.abs(edge - ms)}ms from ${edge}ms`);
    }
  }
  if (rows.length === 0) throw new Error('No spec-cost record was read, so this would report on nothing.');

  const width = (header: string, cell: (row: ListRow) => string): number =>
    Math.max(header.length, ...rows.map((row) => cell(row).length)) + 2;
  const name = width('suite', (row) => row.suite);
  console.log(`${'suite'.padEnd(name)}${'specs'.padStart(7)}${'clear'.padStart(7)}${'near an edge'.padStart(14)}`
    + `${'corroborated'.padStart(14)}${'skipped'.padStart(9)}${'parked'.padStart(8)}`);
  for (const row of rows) {
    console.log(`${row.suite.padEnd(name)}${String(row.specs).padStart(7)}${String(row.clear).padStart(7)}`
      + `${String(row.nearBand).padStart(14)}${String(row.corroborated).padStart(14)}`
      + `${String(row.skipped).padStart(9)}${String(row.parked).padStart(8)}`);
  }
  // **What the window is actually doing, which no prose should claim.** A cost resting on one reading is one
  // the median cannot protect: `settle` has nothing to weigh the next reading against. `WINDOW`'s doc argues
  // three-against-five, and this is the line that says how often three is reached.
  const corroborated = rows.reduce((sum, row) => sum + row.corroborated, 0);
  // Priced specs, not `specs`: that counts the parked ones too, and a parked spec has no cost to rest on
  // anything. Saying "of 409 costs" where 404 exist would be a false clause on a line about the window
  const priced = rows.reduce((sum, row) => sum + row.clear + row.nearBand, 0);
  console.log(`\n${corroborated} of ${priced} costs rest on more than one reading. The rest are a single `
    + 'reading, which the median cannot outvote — see `WINDOW` in scripts/lib/spec-cost.ts.');
  console.log(`\n${near.length} spec${near.length === 1 ? '' : 's'} within ${COST_ACCURACY * 100}% of the edge that `
    + 'could move it, which is what a recorded cost is good to — so a re-measurement could carry it over.');
  // The distance is to the recorded cost, and a record is deliberately sticky: `moved` rewrites a row only
  // past max(300ms, 35%), so the number below can be that far from what the spec costs today. Measured
  // 2026-10-01, `lint-scope` was recorded at 2388ms and read 2025-2171ms over three runs — still inside the
  // window, 366ms from its edge rather than the 112ms the record implies.
  if (near.length > 0) {
    console.log('Distances are to the recorded cost, which is held until a reading moves past its tolerance:');
  }
  for (const line of near.sort()) console.log(line);
}

const { mode, only, named, force, all, forget, dry } = parseArgs(process.argv.slice(2), UNIT_SUITES.map((suite) => suite.dir));

// Before any mode reads a record, and for all of them: a path that names no spec is the caller's mistake, and
// every one of them is worth reporting at once rather than one per run
const absent = absentNamed(REPO_ROOT, UNIT_SUITES.map((suite) => suite.dir), named);
if (absent.length > 0) {
  throw new Error(`These are not specs:\n  ${absent.join('\n  ')}\n`
    + 'Name a spec by its repo-relative path, as `packages/<suite>/tests/<file>.spec.ts`.');
}

if (mode === 'list') list(only, named);
else if (mode === 'update') {
  const dirs = suitesFor(UNIT_SUITES.map((suite) => suite.dir), only, named);
  const plans = UNIT_SUITES
    .filter((suite) => dirs.includes(suite.dir))
    .map((suite) => ({ suite, ...planFor(REPO_ROOT, suite.dir, namedIn(suite.dir, named), all) }));
  update(plans, dry);
} else check(only, named);
