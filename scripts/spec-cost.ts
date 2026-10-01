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
 * in. It says which case it took. `--all` is how you ask for the whole thing anyway, after a bundler bump —
 * and it is the only thing that clears a *correlated* drift, since one that adds a fifth to every spec sits
 * under every per-spec tolerance and so re-records nothing. It rewrites every row it measured only when the
 * body has moved further than idle runs vary (`rewritesEveryRow`); on a quiet run it settles them like any
 * other, because rewriting a row that agrees with the record is the churn the tolerance exists to prevent.
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
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { idleNow, IDLE_FLOOR, refusesAsBusy } from './lib/measure.ts';
import { UNIT_SUITES, type UnitSuite } from './lib/unit-suites.ts';
import {
  CONTENTION_RATIO_MAX, COST_ACCURACY, FAST_BELOW_MS, INTEGRATION_ABOVE_MS, PLACEMENT_GUARD, describeBudget,
  halfOfPath, hasSplit, ratiosFromMoves, underBound,
  nearEdge, overBudget,
  CONFIG_BY_HALF, absentNamed, drift, drifted, namedIn, parseArgs, planFor, readSpecCost, refusesAsContended,
  rewritesEveryRow, settle, specCostFile, specFiles, stale, suitesFor, unrecorded, type SpecCostPlan,
} from './lib/spec-cost.ts';

// eslint-disable-next-line no-control-regex -- vitest colours its output and this reads it back
const ANSI = /\u001B\[[0-9;]*m/g;
/**
 * A file's own line in vitest's default reporter: the whole file's time, which is what a half is sized by.
 * The optional `|project|` is what a pooled run prefixes; a per-package run has none, and this reads both.
 */
const FILE_LINE = /^\s*[✓×↓❯]\s+(?:\|[^|]*\|\s+)?(\S+\.(?:spec|test)\.ts)\s+\(([^)]*)\)(?:\s+([\d.]+)(ms|s)\b)?/;

const packageDir = (suite: UnitSuite): string => path.join(REPO_ROOT, 'packages', suite.dir);

interface Measured { costs: Record<string, number>; skipped: string[] }

function measure(suite: UnitSuite, config: string): Measured {
  const dir = packageDir(suite);
  const result = spawnSync('npx', ['vitest', 'run', '--config', config], { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(ANSI, '');

  // A cost measured from a failing run is not a cost — with one exception, the guard that reads the record
  // this command is replacing. While the record is stale it fails, and skipping it instead would leave it
  // with no measured cost at all, so it runs, fails, and is measured like everything else.
  if (result.status !== 0) {
    const failed = [...out.matchAll(/^\s*FAIL\s+(?:\|[^|]*\|\s+)?(\S+\.(?:spec|test)\.ts)/gm)].map((m) => m[1]);
    const others = failed.filter((file) => file !== PLACEMENT_GUARD);
    if (others.length > 0 || failed.length === 0) {
      throw new Error(`vitest failed for ${suite.workspace} ${config}; a cost measured from a failing run is not a cost.\n${out.slice(-4000)}`);
    }
  }

  const costs: Record<string, number> = {};
  const skipped: string[] = [];
  const partial: string[] = [];
  for (const raw of out.split('\n')) {
    const match = FILE_LINE.exec(raw);
    if (!match) continue;
    const [, file, counts, value, unit] = match;
    if (value === undefined) {
      // No duration at all: vitest prints none for a file where every test was skipped
      skipped.push(file);
      continue;
    }
    costs[file] = unit === 's' ? Math.round(Number(value) * 1000) : Number(value);
    // A file that ran some of its tests and skipped the rest has a cost that understates it, which is worse
    // than having none — it would be placed on a number that is not what the file does.
    if (/skipped/.test(counts)) partial.push(file);
  }
  if (partial.length > 0) {
    throw new Error(`${suite.workspace} ${config} skipped some tests in ${partial.join(', ')}; that file's cost understates it. Fix the skip, then re-measure.`);
  }
  return { costs, skipped };
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

  // What each suite's `pretest` does, because this bypasses it by calling vitest directly. Without it the
  // specs fail on the staleness guard rather than running. Skipped when nothing is being measured.
  // Before anything is measured, because the record is a *sample* and a sample taken on a busy box is
  // about the box. `refusesAsContended` below asks the other question — did too much move, once we have the
  // numbers — and structurally cannot fire for a row that is merely *new*: an addition has not moved. That
  // is exactly how a cost got recorded at a load of 71 and had to be reverted by hand.
  if (work.some((plan) => plan.configs.length > 0)) {
    const idle = idleNow();
    if (refusesAsBusy({ idle, floor: IDLE_FLOOR, force })) {
      throw new Error(`The machine is ${Math.round(idle * 100)}% idle and recording refuses below `
        + `${Math.round(IDLE_FLOOR * 100)}%. What you would record is the machine, not the specs.\n`
        + '  Wait for it to go quiet, or pass --force if you mean to record this.');
    }
  }

  if (work.some((plan) => plan.configs.length > 0)) {
    const ensured = spawnSync('npm', ['run', 'packages:ensure'], { cwd: REPO_ROOT, encoding: 'utf8' });
    if (ensured.status !== 0) throw new Error(`packages:ensure failed:\n${ensured.stdout}${ensured.stderr}`);
  }

  for (const plan of work) {
    const { suite } = plan;
    const dir = packageDir(suite);
    const files = specFiles(dir);
    const previous = readSpecCost(REPO_ROOT, suite.dir);

    // Only the specs the chosen configs actually run. Every guard below is scoped to these: over the whole
    // suite they would each fire on a file this run never claimed to measure.
    const measuredFiles = files.filter((file) => plan.configs.includes(CONFIG_BY_HALF[halfOfPath(file)]));
    const runs = plan.configs.map((config) => measure(suite, config));
    const costs = Object.assign({}, ...runs.map((run) => run.costs)) as Record<string, number>;

    // What the per-spec tolerance cannot say. Each spec settling inside its threshold is the normal case and
    // the reason the file is stable; all of them settling in the same direction is a uniform slowdown, and
    // the only place it shows is the total. Undefined when nothing measured had a value to move from.
    const body = drift(previous, costs);
    const rewriteAll = rewritesEveryRow({ all, body });
    const { record, added, moved, rewritten, dropped } = settle({
      previous, costs, skipped: [...new Set(runs.flatMap((run) => run.skipped))], measuredFiles,
      prune: plan.prune, rewriteAll,
    });

    // What a sample can check: not equality, which it never has, but reproducibility. An idle run moves a
    // handful; a contended one moves most of what it could move and records the machine instead of the specs.
    // Only specs that had a value to move are evidence of that — a first measurement is not.
    const comparable = Object.keys(costs).length - added.length;
    if (refusesAsContended({ hasPrevious: previous !== undefined, force, moved: moved.length, comparable })) {
      throw new Error(`${suite.workspace}: ${moved.length} of ${comparable} already-recorded specs moved, `
        + `which is more than a measurement should. That is what a loaded machine looks like — run this with `
        + `nothing else running, or pass --force if the suite really did change this much.`);
    }

    const missing = unrecorded(record, measuredFiles);
    if (missing.length > 0) throw new Error(`These ${suite.workspace} specs ran nothing and were not reported as skipped:\n  ${missing.join('\n  ')}`);

    const file = path.join(REPO_ROOT, specCostFile(suite.dir));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const next = `${JSON.stringify(record, null, 2)}\n`;
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') !== next) fs.writeFileSync(file, next);

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
    const budget = describeBudget(overBudget(dir, record.costs, measuredFiles), suite.dir);
    const asBody = body === undefined ? '' : `, body ${body >= 0 ? '+' : ''}${(body * 100).toFixed(0)}%`;
    // Every way the record can differ from the one it replaced, for the same reason `settle` compares rather
    // than enumerates: a change nobody listed reads as "none moved" over a rewritten file, and a spec that
    // stops running is exactly that.
    const did = [
      plan.configs.length === 0 ? 'measured nothing'
        : [
          added.length > 0 ? `${added.length} added` : '',
          moved.length > 0 ? `${moved.length} moved` : '',
          // The drift being cleared: rows carried up or down with the body, which no single one of them
          // moved enough to ask for. Counted apart from the movements rather than summed with them, because
          // one word for both read a run that rewrote the file as a suite that had got slower.
          rewritten.length > moved.length ? `${rewritten.length - moved.length} re-recorded` : '',
          dropped.length > 0 ? `${dropped.length} stopped running` : '',
        ].filter(Boolean).join(', ') || 'none moved',
      plan.prune.length > 0 ? `${plan.prune.length} gone` : '',
    ].filter(Boolean).join(', ');
    console.log(`${suite.workspace.padEnd(20)} ${String(files.length).padStart(3)} specs${record.skipped.length ? `, ${record.skipped.length} skipped` : ''}`
      + `, ${did}${asBody} -> ${specCostFile(suite.dir)}${budget.tail ? `  (${budget.tail})` : ''}`);
    // Two sentences, because the run that reports a drift and the run that clears it are not the same run.
    // Advising `--all` to someone who just ran it, over a record it has already rewritten, describes a state
    // that no longer holds — and this is the one place the reader learns which of the two happened.
    if (drifted(body)) {
      console.log(`  the suite moved ${(body * 100).toFixed(0)}% as a body, which is more than idle runs vary. `
        + 'A drift this size sits under every per-spec tolerance, so no measurement re-records it on its own — '
        + (rewriteAll
          ? 'every row this measured has been re-recorded against it.'
          : 'until one does, anything reading the total reads a number that is no longer true. '
            + '`npm run spec-cost:update -- --all` re-records it.'));
    }
    for (const line of budget.lines) console.log(line);
    if (budget.advice) console.log(budget.advice.split('\n').map((line) => `  ${line}`).join('\n'));
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
  const renames: string[] = [];
  const recordable = new Set<string>();
  let total = 0;
  for (const suite of suites) {
    const dir = packageDir(suite);
    const record = readSpecCost(REPO_ROOT, suite.dir);
    if (!record) {
      problems.push(`  no ${specCostFile(suite.dir)}`);
      recordable.add(suite.dir);
      continue;
    }
    const files = specFiles(dir);
    const asked = named.length > 0 ? namedIn(suite.dir, named) : files;
    total += asked.length;
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
    for (const found of overBudget(dir, record.costs, asked)) {
      if (found.kind !== 'rename') continue;
      renames.push(`  ${(found.ms / 1000).toFixed(1)}s is ${found.belongs}, but this is in the ${halfOfPath(found.file)} half: ${suite.dir}/${found.file}`);
    }
  }
  if (problems.length > 0 || renames.length > 0) {
    // The two kinds take different fixes, and telling them apart is the whole value of the advice: an
    // update records what it can measure and cannot move a file, so a misplaced spec needs renaming and
    // nothing else. Naming one command for both sent people to re-measure a suite that was already right.
    const advice = [
      problems.length > 0 ? `Run: npm run spec-cost:update${recordable.size === 1 ? ` -- --suite ${[...recordable][0]}` : ''}` : '',
      renames.length > 0 ? `Rename ${renames.length === 1 ? 'it' : 'them'} into the half the cost implies; no measurement will move ${renames.length === 1 ? 'it' : 'them'}.` : '',
    ].filter(Boolean).join('\n');
    const found = [...problems, ...renames].join('\n');
    throw new Error(`Spec costs are out of date (a fast spec moves above ${INTEGRATION_ABOVE_MS}ms, an integration one comes back below ${FAST_BELOW_MS}ms):\n${found}\n\n${advice}`);
  }
  console.log(named.length > 0
    ? `✅ ${total} spec${total === 1 ? '' : 's'}, recorded and in the half its cost implies`
    : `✅ ${total} specs across ${suites.length} suite${suites.length === 1 ? '' : 's'}, each recorded and in the half its cost implies`);
}

/**
 * What the record holds, rather than whether it is current.
 *
 * The distribution is the point: 304 of 366 specs are under 500ms and never near a decision, so the few that
 * sit inside the band are the only ones whose placement a re-measurement could move. Rows before printing,
 * so a spec can assert over them without reading stdout.
 */
interface ListRow { readonly suite: string; readonly specs: number; readonly settled: number; readonly nearBand: number }

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
    const costs = Object.entries(record.costs);
    // Counted only where there is a second half to move into; see the comment above
    const atRisk = hasSplit(packageDir(suite)) ? costs.filter(([file, ms]) => nearEdge(file, ms)) : [];
    rows.push({ suite: suite.dir, specs: costs.length, settled: costs.length - atRisk.length, nearBand: atRisk.length });
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
  console.log(`${'suite'.padEnd(name)}${'specs'.padStart(7)}${'clear'.padStart(7)}${'near an edge'.padStart(14)}`);
  for (const row of rows) {
    console.log(`${row.suite.padEnd(name)}${String(row.specs).padStart(7)}${String(row.settled).padStart(7)}${String(row.nearBand).padStart(14)}`);
  }
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

const { mode, only, named, force, all, dry } = parseArgs(process.argv.slice(2), UNIT_SUITES.map((suite) => suite.dir));

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
