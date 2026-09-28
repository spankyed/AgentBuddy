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
  FAST_BELOW_MS, INTEGRATION_ABOVE_MS, PLACEMENT_GUARD, configsFor, halfOfPath, hasSplit, misplaced,
  changesIn, CONFIG_BY_HALF, configsOf, contended, drift, DRIFTED, moved, readSpecCost, specCostFile, specFiles, stale, unrecorded,
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

/** What one suite needs doing, worked out from the record before anything runs */
interface SuitePlan {
  readonly suite: UnitSuite;
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
function planFor(suite: UnitSuite, named: readonly string[], all: boolean): SuitePlan {
  const dir = packageDir(suite);
  const files = specFiles(dir);
  const previous = readSpecCost(REPO_ROOT, suite.dir);
  const prune = previous === undefined ? [] : stale(previous, files);

  if (all) return { suite, configs: configsFor(dir), prune, reason: 'every spec, asked for' };
  if (named.length > 0) return { suite, configs: configsOf(dir, named), prune, reason: `${named.length} named` };

  const needs = previous === undefined ? files : unrecorded(previous, files);
  if (needs.length > 0) return { suite, configs: configsOf(dir, needs), prune, reason: `${needs.length} unmeasured` };
  return { suite, configs: [], prune, reason: prune.length > 0 ? `${prune.length} gone` : 'current' };
}

function describe(plan: SuitePlan): string {
  const doing = [
    plan.configs.length > 0 ? `measure ${plan.configs.join(' + ')}` : '',
    plan.prune.length > 0 ? `drop ${plan.prune.length}` : '',
  ].filter(Boolean).join(', ') || 'nothing';
  return `${plan.suite.workspace.padEnd(20)} ${doing.padEnd(46)} (${plan.reason})`;
}

function update(plans: readonly SuitePlan[], dry: boolean): void {
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
    const kept = Object.fromEntries(Object.entries(previous?.costs ?? {}).filter(([spec]) => !plan.prune.includes(spec)));

    // Only the specs the chosen configs actually run. Every guard below is scoped to these: over the whole
    // suite they would each fire on a file this run never claimed to measure.
    const measuredFiles = files.filter((file) => plan.configs.includes(CONFIG_BY_HALF[halfOfPath(file)]));
    const runs = plan.configs.map((config) => measure(suite, config));
    const costs = Object.assign({}, ...runs.map((run) => run.costs)) as Record<string, number>;

    // A measurement replaces the recorded one only when it says something the record does not already say.
    // Without this the file is rewritten on every run by jitter alone, and a real movement is one line among
    // a hundred that mean nothing. `moved` carries the measured reasoning.
    const settled: Record<string, number> = { ...kept };
    for (const [spec, ms] of Object.entries(costs)) {
      const before = previous?.costs[spec];
      settled[spec] = moved(spec, before, ms) ? ms : before!;
    }
    const { added, remeasured } = changesIn(previous, settled, Object.keys(costs));

    // What a sample can check: not equality, which it never has, but reproducibility. An idle run moves a
    // handful; a contended one moves most of what it could move and records the machine instead of the specs.
    // Only specs that had a value to move are evidence of that — a first measurement is not.
    const comparable = Object.keys(costs).length - added.length;
    if (previous !== undefined && !force && contended(remeasured.length, comparable)) {
      throw new Error(`${suite.workspace}: ${remeasured.length} of ${comparable} already-recorded specs moved, `
        + `which is more than a measurement should. That is what a loaded machine looks like — run this with `
        + `nothing else running, or pass --force if the suite really did change this much.`);
    }

    // What the per-spec tolerance cannot say. Each spec settling inside its threshold is the normal case and
    // the reason the file is stable; all of them settling in the same direction is a uniform slowdown, and
    // the only place it shows is the total. Reported always, since a number nobody sees is not a signal.
    const drifted = drift(previous, costs);

    const measuredSkipped = [...new Set(runs.flatMap((run) => run.skipped))].filter((file) => settled[file] === undefined);
    const keptSkipped = (previous?.skipped ?? []).filter((file) => !plan.prune.includes(file) && !measuredFiles.includes(file));
    const skipped = [...new Set([...keptSkipped, ...measuredSkipped])].sort();

    const record = { measuredAt: new Date().toISOString(), costs: Object.fromEntries(Object.entries(settled).sort(([a], [b]) => a.localeCompare(b))), skipped };

    const missing = unrecorded(record, measuredFiles);
    if (missing.length > 0) throw new Error(`These ${suite.workspace} specs ran nothing and were not reported as skipped:\n  ${missing.join('\n  ')}`);

    const file = path.join(REPO_ROOT, specCostFile(suite.dir));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // `measuredAt` moves with the costs, not with the run: a record nothing moved is byte-identical, so an
    // update that found nothing leaves no diff to read past. A prune moves it, having changed the record.
    const settledRecord = added.length === 0 && remeasured.length === 0 && plan.prune.length === 0 && previous !== undefined
      ? { ...previous, skipped }
      : record;
    const next = `${JSON.stringify(settledRecord, null, 2)}\n`;
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') !== next) fs.writeFileSync(file, next);

    const moves = misplaced(settled, files);
    const asBody = Object.keys(costs).length > 0 && previous !== undefined
      ? `, body ${drifted >= 0 ? '+' : ''}${(drifted * 100).toFixed(0)}%` : '';
    const did = [
      plan.configs.length === 0 ? 'measured nothing'
        : [added.length > 0 ? `${added.length} added` : '', remeasured.length > 0 ? `${remeasured.length} moved` : '']
          .filter(Boolean).join(', ') || 'none moved',
      plan.prune.length > 0 ? `${plan.prune.length} gone` : '',
    ].filter(Boolean).join(', ');
    console.log(`${suite.workspace.padEnd(20)} ${String(files.length).padStart(3)} specs${skipped.length ? `, ${skipped.length} skipped` : ''}`
      + `, ${did}${asBody} -> ${specCostFile(suite.dir)}${moves.length ? `  (${moves.length} in the wrong half)` : ''}`);
    if (Math.abs(drifted) > DRIFTED) {
      console.log(`  the suite moved ${(drifted * 100).toFixed(0)}% as a body, which is more than idle runs vary. `
        + 'A drift this size can sit under every per-spec tolerance and leave the record uniformly stale, so '
        + 'anything reading the total reads a number that is no longer true. `--all` re-measures it.');
    }
    for (const { file: spec, ms, belongs } of moves) console.log(`  ${(ms / 1000).toFixed(1)}s  ${spec}  ->  ${belongs}`);
  }
}

function check(only: string | undefined): void {
  const suites = UNIT_SUITES.filter((candidate) => only === undefined || candidate.dir === only);
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
    total += files.length;
    const before = problems.length;
    problems.push(
      ...unrecorded(record, files).map((f) => `  unmeasured: ${suite.dir}/${f}`),
      ...stale(record, files).map((f) => `  recorded but gone: ${suite.dir}/${f}`),
    );
    if (problems.length > before) recordable.add(suite.dir);
    if (hasSplit(dir)) {
      for (const { file, ms, belongs } of misplaced(record.costs, files)) {
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
  console.log(`✅ ${total} specs across ${suites.length} suite${suites.length === 1 ? '' : 's'}, each recorded and in the half its cost implies`);
}

/**
 * What the record holds, rather than whether it is current.
 *
 * The distribution is the point: 304 of 366 specs are under 500ms and never near a decision, so the few that
 * sit inside the band are the only ones whose placement a re-measurement could move. Rows before printing,
 * so a spec can assert over them without reading stdout.
 */
interface ListRow { readonly suite: string; readonly specs: number; readonly settled: number; readonly nearBand: number }

function list(only: string | undefined): void {
  const rows: ListRow[] = [];
  const near: string[] = [];
  for (const suite of UNIT_SUITES.filter((candidate) => only === undefined || candidate.dir === only)) {
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

const args = process.argv.slice(2);
const force = args.includes('--force');
const all = args.includes('--all');
const dry = args.includes('--dry');

const suiteFlag = args.indexOf('--suite');
const only = suiteFlag === -1 ? undefined : args[suiteFlag + 1];
if (only !== undefined && !UNIT_SUITES.some((suite) => suite.dir === only)) {
  throw new Error(`No suite "${only}". They are:\n  ${UNIT_SUITES.map((suite) => suite.dir).join('\n  ')}`);
}

/** Repo-relative spec paths, which name both the suite they belong to and the half that measures them */
const named = args.filter((arg) => !arg.startsWith('--') && arg !== only);
const unknown = named.filter((file) => !UNIT_SUITES.some((suite) => file.startsWith(`packages/${suite.dir}/`)));
if (unknown.length > 0) {
  throw new Error(`These are in no unit suite, so nothing measures them:\n  ${unknown.join('\n  ')}\n`
    + 'Name a spec by its repo-relative path, as `packages/<suite>/tests/<file>.spec.ts`.');
}

if (args.includes('--list')) list(only);
else if (args.includes('--update')) {
  const plans = UNIT_SUITES
    .filter((suite) => only === undefined || suite.dir === only)
    .filter((suite) => named.length === 0 || named.some((file) => file.startsWith(`packages/${suite.dir}/`)))
    .map((suite) => planFor(suite, named
      .filter((file) => file.startsWith(`packages/${suite.dir}/`))
      .map((file) => file.slice(`packages/${suite.dir}/`.length)), all));
  update(plans, dry);
} else check(only);
