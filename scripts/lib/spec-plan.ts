/**
 * What `npm run spec` runs for what you gave it, as data.
 *
 * The definition, not the command — `scripts/spec.ts` is the command over it, the same split as
 * `scripts/test-unit-pool.ts` over `scripts/lib/unit-pool.ts`. Separate so a spec can assert the routing
 * without running anything, which is the only way a decision like *"a source file runs every spec that
 * covers it"* stays true.
 *
 * **The rule.** A spec path, a directory or a name names specs directly, so those run in the package that
 * holds them — that is what you asked for. A **source file** is a different question: after an edit you
 * want *what could this break*, and the answer is every spec that imports it, transitively, wherever it
 * lives. That question used to be answered with the file's own package, which for `@abuddy/sdk` meant one
 * of the seven suites covering it, reported green.
 *
 * Vitest already answers it properly: the root `vitest.config.ts` lists every host project and `related`
 * resolves the module graph across all of them **in one process**. So a source file plans one root run.
 * Measured 2026-09-26: `packages/abuddy-sdk/src/types/sdk-entities.ts` reaches 104 files, and
 * `scripts/lib/chain-steps.ts` 4 where the old route found 3 — it is both wider and transitive.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { UNIT_SUITES } from './unit-suites.ts';
import { workspaceDeps } from './workspace-deps.ts';

/** One command to run, and where. A plan is a list of these, in order. */
export interface Run {
  /** Printed before it runs, so the output says what is being answered */
  readonly label: string;
  readonly cwd: string;
  readonly command: string;
  readonly args: readonly string[];
  /** Printed after it, for something the mechanism cannot cover */
  readonly note?: string;
}

const IS_SPEC = /\.(spec|test)\.[cm]?[jt]sx?$/;
const SKIP = new Set(['node_modules', 'dist', '.git', '.temp', 'dist-ssr', 'coverage', '__generated__']);

/**
 * The specs a bare name stands for, narrowest reading first: the file's stem, then its name, then the path inside
 * its package. The `packages/<name>/` prefix is never searched, because every path has it — searching the whole
 * repo-relative path made `pack` match 355 of 368 spec files, which ran the suite, tier 3 included, for a plausible
 * search term.
 */
export function matchByName(query: string, root: string): string[] {
  const all = [...specsUnder(path.join(root, 'packages')), ...specsUnder(path.join(root, 'tests'))];
  const stem = (f: string) => path.basename(f).replace(IS_SPEC, '');
  const inPackage = (f: string) => path.relative(root, f).replace(/^packages\/[^/]+\//, '');
  for (const reading of [
    (f: string) => stem(f) === query,
    (f: string) => path.basename(f).includes(query),
    (f: string) => inPackage(f).includes(query),
  ]) {
    const found = all.filter(reading);
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * Whether a name reads as a search rather than a target, in which case the caller lists it instead of running it.
 * A few files in one or two suites is someone narrowing; wider than that and crossing suites means tiers and
 * built-package dependencies they did not ask for.
 */
export function tooBroad(specs: string[], root: string): boolean {
  const suites = new Set(specs.map((s) => packageOf(path.relative(root, s))));
  return specs.length > 4 || suites.size > 2;
}

export function specsUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return specsUnder(full);
    return IS_SPEC.test(entry.name) ? [full] : [];
  });
}

/** The package a repo path belongs to, or null when it is in none: the repo root, `scripts/`, `docs/` */
export const packageOf = (rel: string): string | null => /^packages\/([^/]+)\//.exec(rel)?.[1] ?? null;

/**
 * The pack suites a change to these packages can reach, and which no module graph can show you.
 *
 * A pack suite resolves the published `dist` while the host projects resolve source — deliberately, because
 * `dist` is the one layout a pack author ever has. So a pack's specs never import `packages/<dep>/src` at
 * all, no import edge runs from the file you edited to the spec that covers it, and `related` reports
 * nothing. The edge is real and runs through a build: `src` -> tsdown -> `dist` -> the pack's specs.
 *
 * Which is why this is derived from the *declared* graph (`workspaceDeps`) rather than the import graph, and
 * from the same function the chain keys its cache on. `@app/default-setup` declares four `@abuddy`
 * dependencies, so eight of the twelve packages cannot reach it and should not be warned about: the note
 * used to fire on every root run, including a `@app/renderer` edit, and a warning that is always on is one
 * nobody reads.
 */
export function affectedPackSuites(editedPackages: readonly (string | null)[]): string[] {
  const edited = new Set(editedPackages.filter((p): p is string => p !== null));
  return UNIT_SUITES
    .filter((suite) => suite.kind === 'pack' && workspaceDeps(suite.dir).some((dep) => edited.has(dep)))
    .map((suite) => suite.workspace);
}

/**
 * What a root run says about the pack suites it could not reach — nothing when it could reach none, and
 * nothing under `--full`, where the run below is the answer rather than a thing to go and do next.
 */
export const packSuiteNote = (affected: readonly string[], full = false): string | undefined =>
  affected.length === 0 || full ? undefined
    : `not in this answer: ${affected.join(', ')} reaches this only through a rebuilt dist, so no module `
      + 'graph connects the two — npm run spec:full, or npm run test:unit:pack';

/** The run that answers it, incremental on its own stamp: unchanged inputs report "up to date" and skip */
const packSuiteRun = (root: string, affected: readonly string[]): Run => ({
  label: `${affected.join(', ')}, against a rebuilt dist`,
  cwd: root,
  command: 'npm',
  args: ['run', 'test:unit:pack'],
});

/**
 * The packages the root run already covers, so nothing plans them twice. Read from the root config's
 * literal list, which `chain-inputs.spec.ts` holds equal to `UNIT_SUITES`' host suites.
 */
export function rootProjects(root: string): string[] {
  const config = fs.readFileSync(path.join(root, 'vitest.config.ts'), 'utf-8');
  return [...config.matchAll(/^\s*'packages\/([\w-]+)',$/gm)].map(([, dir]) => dir);
}

/** The one run the command does not announce: it is a precondition, not an answer */
export const ENSURE_LABEL = 'the published packages are built';

/** `packages:ensure`, which a root run needs because npm fires no `pretest` for it */
const ensurePackages = (root: string): Run => ({
  label: ENSURE_LABEL,
  cwd: root,
  command: 'npm',
  args: ['run', 'packages:ensure'],
});

/**
 * One vitest over every host project: `related --run <file>` after an edit, `--changed --run` for the
 * change set. `args` is everything after `vitest`, in order, so the call site reads as the command does.
 */
const rootRun = (root: string, label: string, args: readonly string[], flags: readonly string[], note?: string): Run => ({
  label,
  cwd: root,
  command: 'npx',
  args: ['vitest', ...args, ...flags],
  note,
});

/** A package's own suite, through its `test` script so its pretest and vitest config still apply */
const packageRun = (root: string, pkg: string, args: readonly string[], flags: readonly string[], label: string): Run => ({
  label: `packages/${pkg}: ${label}`,
  cwd: path.join(root, 'packages', pkg),
  command: 'npm',
  args: ['test', '--', ...args, ...flags],
});

/** Playwright's, for a `tests/e2e` path — the root's `test` script rather than a package's */
const e2eRun = (root: string, specs: readonly string[], flags: readonly string[]): Run => ({
  label: 'tests/e2e (playwright)',
  cwd: root,
  command: 'npm',
  args: ['run', 'test', '--', ...specs.map((s) => path.relative(root, s)), ...flags],
});

const groupByPackage = (specs: readonly string[], root: string): Map<string | null, string[]> => {
  const byPkg = new Map<string | null, string[]>();
  for (const spec of specs) {
    const pkg = packageOf(path.relative(root, spec));
    byPkg.set(pkg, [...(byPkg.get(pkg) ?? []), spec]);
  }
  return byPkg;
};

/**
 * A vitest config is read as *data* by `suite-timeouts.spec.ts` and `chain-inputs.spec.ts`, never imported,
 * so no module graph reaches it. It keeps an explicit route; everything else a root run finds.
 */
const IS_VITEST_CONFIG = /(^|\/)vitest\.[\w.]*config\.ts$/;
const CONFIG_READER = 'repo-checks';

/** `--full` asks for the answer a rebuild would give as well, which costs a build and the pack suite */
export interface PlanOptions { readonly full?: boolean }

/**
 * The command's arguments, split.
 *
 * **Targets first, then flags: everything from the first `-` onward is vitest's, verbatim.** Splitting at the
 * first flag rather than filtering by prefix is what makes a flag's *value* its own — `-t "a case"`,
 * `--changed HEAD~1`, `--bail 1` — without this having to know which flags take one.
 *
 * `--full` is the single argument the command consumes, and only in first position. That is what keeps the
 * rule above exact rather than nearly true: filtering `--full` out wherever it appeared would silently eat
 * it as another flag's value, and reading it after a target would make its position meaningful in a way
 * nothing else here is. `npm run spec:full` puts it there, so nobody types it.
 */
export function splitArgs(argv: readonly string[]): { full: boolean; targets: string[]; flags: string[] } {
  const full = argv[0] === '--full';
  const rest = full ? argv.slice(1) : [...argv];
  const firstFlag = rest.findIndex((a) => a.startsWith('-'));
  return {
    full,
    targets: firstFlag === -1 ? rest : rest.slice(0, firstFlag),
    flags: firstFlag === -1 ? [] : rest.slice(firstFlag),
  };
}

export interface Planned {
  readonly runs: readonly Run[];
  /** Targets that matched nothing, so the command can fail rather than pass silently */
  readonly unmatched: readonly string[];
  /** Names that read as a search: listed for the caller to narrow, rather than run */
  readonly ambiguous: readonly { readonly query: string; readonly specs: readonly string[] }[];
}

export function planTargets(targets: readonly string[], flags: readonly string[], root: string,
  { full = false }: PlanOptions = {}): Planned {
  const runs: Run[] = [];
  const unmatched: string[] = [];
  const ambiguous: { query: string; specs: string[] }[] = [];
  const named: string[] = [];          // spec files the targets name, grouped at the end
  const sourcePackages: (string | null)[] = [];   // whose pack-suite dependents a rebuild would reach
  let wantsRoot = false;

  for (const arg of targets) {
    const abs = path.resolve(root, arg);
    const rel = path.relative(root, abs);
    const exists = fs.existsSync(abs);

    if (exists && fs.statSync(abs).isDirectory()) {
      named.push(...specsUnder(abs));
    } else if (exists && IS_SPEC.test(abs)) {
      named.push(abs);
    } else if (exists && IS_VITEST_CONFIG.test(rel)) {
      // Its own package's suite too, since a config decides what that package runs at all
      const own = packageOf(rel);
      if (own !== null && own !== CONFIG_READER) runs.push(packageRun(root, own, [], flags, '(its config changed)'));
      runs.push(packageRun(root, CONFIG_READER, [], flags, 'the checks that read every config'));
    } else if (exists) {
      wantsRoot = true;
      sourcePackages.push(packageOf(rel));
      runs.push(rootRun(root, `every spec covering ${rel}`, ['related', '--run', rel], flags,
        packSuiteNote(affectedPackSuites([packageOf(rel)]), full)));
    } else {
      const matches = matchByName(arg, root);
      if (matches.length === 0) unmatched.push(arg);
      else if (tooBroad(matches, root)) ambiguous.push({ query: arg, specs: matches });
      else named.push(...matches);
    }
  }

  for (const [pkg, specs] of groupByPackage(named, root)) {
    const label = specs.map((s) => path.relative(pkg === null ? root : path.join(root, 'packages', pkg), s)).join(' ');
    runs.push(pkg === null ? e2eRun(root, specs, flags) : packageRun(root, pkg, specs.map((s) => path.relative(path.join(root, 'packages', pkg), s)), flags, label));
  }

  const affected = wantsRoot ? affectedPackSuites(sourcePackages) : [];
  if (full && affected.length > 0) runs.push(packSuiteRun(root, affected));
  return { runs: wantsRoot ? [ensurePackages(root), ...runs] : runs, unmatched, ambiguous };
}

/**
 * With no target: the specs your uncommitted changes affect.
 *
 * One root `--changed` answers it for every host project at once, resolving the same graph `related` does
 * — including a change under `scripts/`, which reaches `@app/repo-checks` through its specs' imports. The
 * pack suite is asked separately because it is not a root project, and it is asked at all because a change
 * *inside* it is the one thing a root run cannot see.
 */
export function planChanged(changedPackages: readonly string[], flags: readonly string[], root: string,
  { full = false }: PlanOptions = {}): Planned {
  const affected = affectedPackSuites(changedPackages);
  const runs: Run[] = [
    ensurePackages(root),
    rootRun(root, 'the specs your changes affect', ['--changed', '--run'], flags, packSuiteNote(affected, full)),
  ];
  const pack = rootProjects(root);
  for (const pkg of changedPackages) {
    if (!pack.includes(pkg)) runs.push(packageRun(root, pkg, [], flags, '(changed)'));
  }
  // Only when a *dependency* changed: a change inside the pack itself is already its own run above
  if (full && affected.length > 0) runs.push(packSuiteRun(root, affected));
  return { runs, unmatched: [], ambiguous: [] };
}
