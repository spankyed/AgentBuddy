/**
 * What every unit suite's specs cost, and the check that each one is where its cost puts it.
 *
 *     npm run spec-cost:check                      # reads the records; runs nothing
 *     npm run spec-cost:check -- --list            # what they hold, and which specs sit in the band
 *     npm run spec-cost:update                     # the least that makes them current
 *     npm run spec-cost:update -- <spec path>      # that spec's half, nothing else
 *     npm run spec-cost:update -- --suite <dir>    # one suite
 *     npm run spec-cost:update -- --all            # re-measure everything regardless
 *     npm run spec-cost:update -- --dry            # what it would run and write
 *
 * **A bare update does the least that clears what the check would report**, which is often nothing: a
 * deleted spec leaves a row that needs no measurement to drop, and a new spec needs only the half it lives
 * in. It says which case it took. `--all` is how you ask for the whole thing anyway, after a bundler bump.
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
 * machine, and a spec near an edge then moves for no reason anyone can see later.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { UNIT_SUITES, type UnitSuite } from './lib/unit-suites.ts';
import {
  FAST_BELOW_MS, INTEGRATION_ABOVE_MS, PLACEMENT_GUARD, halfOfPath, hasSplit, misplaced,
  CONFIG_BY_HALF, drift, drifted, namedIn, parseArgs, planFor, readSpecCost, refuseAbsent, refusesAsContended,
  settle, specCostFile, specFiles, stale, suitesFor, unrecorded, type SpecCostPlan,
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

    const { record, added, remeasured, dropped } = settle({
      previous, costs, skipped: [...new Set(runs.flatMap((run) => run.skipped))], measuredFiles, prune: plan.prune, all,
    });

    // What a sample can check: not equality, which it never has, but reproducibility. An idle run moves a
    // handful; a contended one moves most of what it could move and records the machine instead of the specs.
    // Only specs that had a value to move are evidence of that — a first measurement is not.
    const comparable = Object.keys(costs).length - added.length;
    // `--all` records every measurement by design, so `remeasured` is then near-total and this would refuse
    // the one mode that exists to clear a drift. So `--all` on a loaded machine records that machine,
    // unguarded — the body drift below still prints, which is the evidence, and asking for it is the
    // deliberate act the guard exists to distinguish from an accident. `refusesAsContended` holds the rest.
    if (refusesAsContended({ hasPrevious: previous !== undefined, force, all, remeasured: remeasured.length, comparable })) {
      throw new Error(`${suite.workspace}: ${remeasured.length} of ${comparable} already-recorded specs moved, `
        + `which is more than a measurement should. That is what a loaded machine looks like — run this with `
        + `nothing else running, or pass --force if the suite really did change this much.`);
    }

    const missing = unrecorded(record, measuredFiles);
    if (missing.length > 0) throw new Error(`These ${suite.workspace} specs ran nothing and were not reported as skipped:\n  ${missing.join('\n  ')}`);

    const file = path.join(REPO_ROOT, specCostFile(suite.dir));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const next = `${JSON.stringify(record, null, 2)}\n`;
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') !== next) fs.writeFileSync(file, next);

    const moves = misplaced(record.costs, files);
    // What the per-spec tolerance cannot say. Each spec settling inside its threshold is the normal case and
    // the reason the file is stable; all of them settling in the same direction is a uniform slowdown, and
    // the only place it shows is the total. Undefined when nothing measured had a value to move from.
    const body = drift(previous, costs);
    const asBody = body === undefined ? '' : `, body ${body >= 0 ? '+' : ''}${(body * 100).toFixed(0)}%`;
    // Every way the record can differ from the one it replaced, for the same reason `settle` compares rather
    // than enumerates: a change nobody listed reads as "none moved" over a rewritten file, and a spec that
    // stops running is exactly that.
    const did = [
      plan.configs.length === 0 ? 'measured nothing'
        : [
          added.length > 0 ? `${added.length} added` : '',
          remeasured.length > 0 ? `${remeasured.length} moved` : '',
          dropped.length > 0 ? `${dropped.length} stopped running` : '',
        ].filter(Boolean).join(', ') || 'none moved',
      plan.prune.length > 0 ? `${plan.prune.length} gone` : '',
    ].filter(Boolean).join(', ');
    console.log(`${suite.workspace.padEnd(20)} ${String(files.length).padStart(3)} specs${record.skipped.length ? `, ${record.skipped.length} skipped` : ''}`
      + `, ${did}${asBody} -> ${specCostFile(suite.dir)}${moves.length ? `  (${moves.length} in the wrong half)` : ''}`);
    if (drifted(body)) {
      console.log(`  the suite moved ${(body * 100).toFixed(0)}% as a body, which is more than idle runs vary. `
        + 'A drift this size can sit under every per-spec tolerance and leave the record uniformly stale, so '
        + 'anything reading the total reads a number that is no longer true. `--all` re-measures it.');
    }
    for (const { file: spec, ms, belongs } of moves) console.log(`  ${(ms / 1000).toFixed(1)}s  ${spec}  ->  ${belongs}`);
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
    refuseAbsent(suite.dir, files, asked);
    total += asked.length;
    const before = problems.length;
    problems.push(
      ...unrecorded(record, asked).map((f) => `  unmeasured: ${suite.dir}/${f}`),
      // Only over the whole suite: `stale` returns what the record holds and the file list does not, so
      // against a narrowed list every spec the caller did not name would read as recorded but gone
      ...(named.length > 0 ? [] : stale(record, files).map((f) => `  recorded but gone: ${suite.dir}/${f}`)),
    );
    if (problems.length > before) recordable.add(suite.dir);
    if (hasSplit(dir)) {
      for (const { file, ms, belongs } of misplaced(record.costs, asked)) {
        renames.push(`  ${(ms / 1000).toFixed(1)}s is ${belongs}, but this is in the ${halfOfPath(file)} half: ${suite.dir}/${file}`);
      }
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
      refuseAbsent(suite.dir, specFiles(packageDir(suite)), asked);
      for (const file of asked) {
        const ms = record?.costs[file];
        // Milliseconds below a second, because the aggregate below only ever prints in-band specs and every
        // one of those is over 1 500ms — naming a cheap spec here would otherwise report it as `0.0s`
        const cost = ms === undefined
          ? (record?.skipped.includes(file) ? 'skipped' : 'unmeasured')
          : (ms < 1_000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
        const band = ms !== undefined && ms >= FAST_BELOW_MS && ms <= INTEGRATION_ABOVE_MS ? '  (in the band)' : '';
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
    const inBand = costs.filter(([, ms]) => ms >= FAST_BELOW_MS && ms <= INTEGRATION_ABOVE_MS);
    rows.push({ suite: suite.dir, specs: costs.length, settled: costs.length - inBand.length, nearBand: inBand.length });
    for (const [file, ms] of inBand) near.push(`  ${(ms / 1000).toFixed(1)}s  ${halfOfPath(file).padEnd(11)} ${suite.dir}/${file}`);
  }
  if (rows.length === 0) throw new Error('No spec-cost record was read, so this would report on nothing.');

  const width = (header: string, cell: (row: ListRow) => string): number =>
    Math.max(header.length, ...rows.map((row) => cell(row).length)) + 2;
  const name = width('suite', (row) => row.suite);
  console.log(`${'suite'.padEnd(name)}${'specs'.padStart(7)}${'clear'.padStart(7)}${'in the band'.padStart(13)}`);
  for (const row of rows) {
    console.log(`${row.suite.padEnd(name)}${String(row.specs).padStart(7)}${String(row.settled).padStart(7)}${String(row.nearBand).padStart(13)}`);
  }
  console.log(`\n${near.length} spec${near.length === 1 ? '' : 's'} between ${FAST_BELOW_MS}ms and ${INTEGRATION_ABOVE_MS}ms, `
    + 'where a re-measurement could change which half it belongs in:');
  for (const line of near.sort()) console.log(line);
}

const { mode, only, named, force, all, dry } = parseArgs(process.argv.slice(2), UNIT_SUITES.map((suite) => suite.dir));

if (mode === 'list') list(only, named);
else if (mode === 'update') {
  const dirs = suitesFor(UNIT_SUITES.map((suite) => suite.dir), only, named);
  const plans = UNIT_SUITES
    .filter((suite) => dirs.includes(suite.dir))
    .map((suite) => ({ suite, ...planFor(REPO_ROOT, suite.dir, namedIn(suite.dir, named), all) }));
  update(plans, dry);
} else check(only, named);
