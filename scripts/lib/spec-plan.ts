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
 * `@app/default-setup` is not among the root projects and cannot be: it resolves the published `dist`
 * while the host projects resolve source, and Node conditions are per process (`UnitSuite.kind`). So
 * `related` on a workspace source path finds nothing there — that suite never imports the source, and
 * reaches a change through the rebuilt `dist`, which is what the chain expresses through `SUITE_READS` and
 * a module graph cannot see. Said out loud rather than hidden: a limit you can read is a limit.
 */
export const PACK_SUITE_NOTE =
  'not covered: @app/default-setup tests the built packages rather than this source (npm run test:unit:pack)';

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
const rootRun = (root: string, label: string, args: readonly string[], flags: readonly string[]): Run => ({
  label,
  cwd: root,
  command: 'npx',
  args: ['vitest', ...args, ...flags],
  note: PACK_SUITE_NOTE,
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

export interface Planned {
  readonly runs: readonly Run[];
  /** Targets that matched nothing, so the command can fail rather than pass silently */
  readonly unmatched: readonly string[];
}

export function planTargets(targets: readonly string[], flags: readonly string[], root: string): Planned {
  const runs: Run[] = [];
  const unmatched: string[] = [];
  const named: string[] = [];          // spec files the targets name, grouped at the end
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
      runs.push(rootRun(root, `every spec covering ${rel}`, ['related', '--run', rel], flags));
    } else {
      const matches = specsUnder(path.join(root, 'packages')).concat(specsUnder(path.join(root, 'tests')))
        .filter((f) => path.relative(root, f).includes(arg));
      if (matches.length === 0) unmatched.push(arg);
      named.push(...matches);
    }
  }

  for (const [pkg, specs] of groupByPackage(named, root)) {
    const label = specs.map((s) => path.relative(pkg === null ? root : path.join(root, 'packages', pkg), s)).join(' ');
    runs.push(pkg === null ? e2eRun(root, specs, flags) : packageRun(root, pkg, specs.map((s) => path.relative(path.join(root, 'packages', pkg), s)), flags, label));
  }

  return { runs: wantsRoot ? [ensurePackages(root), ...runs] : runs, unmatched };
}

/**
 * With no target: the specs your uncommitted changes affect.
 *
 * One root `--changed` answers it for every host project at once, resolving the same graph `related` does
 * — including a change under `scripts/`, which reaches `@app/repo-checks` through its specs' imports. The
 * pack suite is asked separately because it is not a root project, and it is asked at all because a change
 * *inside* it is the one thing a root run cannot see.
 */
export function planChanged(changedPackages: readonly string[], flags: readonly string[], root: string): Planned {
  const runs: Run[] = [ensurePackages(root), rootRun(root, 'the specs your changes affect', ['--changed', '--run'], flags)];
  const pack = rootProjects(root);
  for (const pkg of changedPackages) {
    if (!pack.includes(pkg)) runs.push(packageRun(root, pkg, [], flags, '(changed)'));
  }
  return { runs, unmatched: [] };
}
