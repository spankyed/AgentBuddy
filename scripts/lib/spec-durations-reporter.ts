/**
 * A vitest reporter that prints nothing and records what each spec file took, and which projects ran.
 *
 * It replaces a regex over vitest's console output. That parse worked, and the reason to stop is what it
 * was reading: the pretty-printer. It had to strip ANSI, handle **two** project-label spellings — vitest's
 * `formatProjectName` writes `|name|` when colour is unsupported and a space-padded coloured name when it
 * is, so which one arrives depends on `FORCE_COLOR` — and recover a file's owning suite from its path when
 * no label was printed at all. This repo has already been bitten there once: `projectsThatRan` read only
 * the uncoloured spelling and reported all eleven host projects absent from a run every one of them had
 * passed.
 *
 * **The duration here is the field the console prints, not a reconstruction of it.** `diagnostic().duration`
 * is what `getDurationPrefix` rounds for display, so the two agree by construction. That is also why
 * vitest's own `json` reporter is not used: it carries no per-file duration at all, only a span between the
 * first and last *test*, which excludes file-level hooks and collection — measured 0.5ms to 42ms low per
 * file, and ~30% low on a small one. For a gate whose bar is a quantile over these numbers, that is a
 * different quantity than the markers were calibrated against. `json` also carries no project name.
 *
 * Why a reporter of our own rather than `json` or `junit`, beyond the numbers: both print
 * `<FORMAT> report written to <path>` through the logger whenever `outputFile` is set, unconditionally and
 * with no option to silence it, so every run would end with a line about a temp file. The alternative —
 * filtering the child's stdout — costs the TTY, because vitest renders differently when its output is not
 * a terminal. `spec-count-reporter.ts` records the same reasoning; this is the second reporter to need it.
 *
 * The path comes from the environment rather than a reporter option so that nothing has to be threaded
 * through vitest's config resolution, as `spec-count-reporter.ts` does.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Reporter } from 'vitest/reporters';

/** The environment variable the pool puts the destination in */
export const SPEC_DURATIONS_FILE = 'SPEC_DURATIONS_FILE';

/**
 * The hooks, named once and checked against vitest's own interface.
 *
 * This is what makes a vitest upgrade a compile error rather than a silent regression: rename or remove
 * either hook and `typecheck` fails here. Without it the reporter would simply stop being called — no file
 * written — and the consumer's refusal is what turns that into a failure rather than a quiet pass. Not
 * hypothetical: `onFinished`, the hook `spec-count-reporter.ts` used first, is already
 * `@deprecated use onTestRunEnd instead` in vitest 3.2.4.
 */
const STARTED = 'onTestRunStart' satisfies keyof Reporter;
const ENDED = 'onTestRunEnd' satisfies keyof Reporter;

/**
 * The hooks' parameter types, taken from `Reporter` rather than imported by name.
 *
 * `vitest/reporters` exports `Reporter` and not `TestModule` or `TestSpecification`, so the choice is
 * between these two aliases and the `unknown[]` that `spec-count-reporter.ts` settled for. Deriving them
 * keeps the fields below checked against vitest's declarations, which is the whole point of pinning the
 * hook names above: a signature that changes shape fails here instead of at runtime.
 */
type Modules = Parameters<NonNullable<Reporter[typeof ENDED]>>[0];
type Specifications = Parameters<NonNullable<Reporter[typeof STARTED]>>[0];

/** One spec file, as the run that executed it saw it */
export interface ReportedModule {
  /** vitest's own name for the project, which is the workspace name a pool asked for */
  readonly project: string;
  /** The spec's path relative to its project's root, which is how every consumer names a spec */
  readonly file: string;
  /** `diagnostic().duration`: the accumulated time of the module's tests and hooks */
  readonly ms: number;
  /**
   * Whether the module ran at all.
   *
   * Recorded rather than filtered here, so the consumer decides. It matters because a skipped module
   * reports a duration of 0 rather than no duration — `default-setup`'s `claude-code-permission-flow`
   * is one today, behind a `describe.skipIf` — and counting those as readings would drag a half's
   * quantile bar down with files that never executed.
   */
  readonly skipped: boolean;
}

export interface ReportedRun {
  /**
   * Every project the run started, which no built-in reporter can tell you.
   *
   * A project whose files all matched nothing appears in no reporter's *output*, so the only place it can
   * be named is the specifications the run began with. That is the blind spot `projectsThatDidNotRun`
   * documents and could not close: a `--project` filter matching nothing is silently dropped as long as
   * one other filter matched, so a suite whose workspace name had drifted from its vitest project name
   * would be stamped as having passed a run it was excluded from.
   */
  readonly projects: readonly string[];
  readonly modules: readonly ReportedModule[];
}

/** The states in which a module actually executed; everything else carries no duration worth reading */
const RAN = new Set(['passed', 'failed']);

/**
 * What to call a project, which vitest answers for only some runs.
 *
 * `TestProject.name` is documented as "the name of the project or **an empty string if not set**", and no
 * config in this repo sets `test.name`. Under the root config vitest fills it from each project's
 * `package.json`, so a pooled run is named; a standalone run of one package's own config — which is
 * exactly how the pack pool invokes `npm test -w <workspace>` — reports the empty string. Observed: the
 * pack pool refused its own run because `@app/default-setup` "never reported".
 *
 * So the fallback reads the same thing vitest would have: `name` from the `package.json` at the project's
 * root. That keeps one notion of a project's identity — the workspace name, which is what `UNIT_SUITES`
 * holds and what `--project` matches — rather than a second one that happens to agree under one invocation.
 */
function projectName(name: string, root: string): string {
  if (name !== '') return name;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as { name?: string };
    return manifest.name ?? '';
  } catch {
    return '';
  }
}

export default class SpecDurationsReporter implements Reporter {
  readonly #started = new Set<string>();

  [STARTED](specifications: Specifications): void {
    for (const specification of specifications) {
      this.#started.add(projectName(specification.project.name, specification.project.config.root));
    }
  }

  [ENDED](modules: Modules): void {
    const out = process.env[SPEC_DURATIONS_FILE];
    if (out === undefined) return;
    const reported: ReportedModule[] = modules.map((module) => ({
      project: projectName(module.project.name, module.project.config.root),
      file: path.relative(module.project.config.root, module.moduleId),
      ms: module.diagnostic().duration,
      skipped: !RAN.has(module.state()),
    }));
    // The union, not the started set alone: a run whose start hook never fired would otherwise report no
    // projects while reporting their files, and the consumer would read every one of them as absent
    const projects = new Set([...this.#started, ...reported.map(({ project }) => project)]);
    const run: ReportedRun = { projects: [...projects].sort(), modules: reported };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(run, null, 2)}\n`);
  }
}

/**
 * What the run reported, or `undefined` where the file never arrived.
 *
 * The distinction is the one thing this has to get right, and it is the same one
 * `spec-count-reporter.ts`'s reader makes: a reporter that stopped being called writes nothing, and
 * nothing read as an empty run would be a gate checking no markers and a cache recording no durations,
 * both reporting success. So `undefined` is a refusal for the caller to make, never a zero.
 */
export function readReportedRun(file: string): ReportedRun | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ReportedRun>;
    if (!Array.isArray(parsed.modules) || !Array.isArray(parsed.projects)) return undefined;
    return { projects: parsed.projects, modules: parsed.modules };
  } catch {
    return undefined;
  }
}
