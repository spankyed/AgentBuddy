import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { affectedPackSuites, ENSURE_LABEL, packageOf, planChanged, planTargets, splitArgs } from '../../../scripts/lib/spec-plan.ts';
import { PACKAGE_DIRS } from '../../../scripts/lib/workspace-deps.ts';
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';

/**
 * What `npm run spec` decides to run, asserted without running any of it.
 *
 * The routing is the whole value of that command, and it was wrong for a year in a way nothing could catch:
 * a source file ran its own package's specs, so editing `@abuddy/sdk` ran one of the seven suites covering
 * it and reported green. A plan that is data rather than a loop is what makes the decision checkable, which
 * is why `scripts/lib/spec-plan.ts` exists separately from the command over it.
 */

const plan = (target: string) => planTargets([target], [], REPO_ROOT).runs;

/** Any one source module under a directory, so a case about *a* source file needn't name one that may move */
function someSourceFile(dir: string): string {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '__generated__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = someSourceFile(full);
      if (found !== '') return found;
    } else if (/\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) return full;
  }
  return '';
}
const labels = (target: string) => plan(target).map((run) => run.label);

describe('what a target plans', () => {
  it('runs every spec covering a source file, in one root run over all projects', () => {
    const runs = plan('packages/abuddy-sdk/src/types/sdk-entities.ts');
    expect(runs.map((r) => r.label)).toEqual([
      ENSURE_LABEL,
      'every spec covering packages/abuddy-sdk/src/types/sdk-entities.ts',
    ]);
    const [, related] = runs;
    expect(related!.cwd, 'a root run, so vitest resolves the graph across every project at once').toBe(REPO_ROOT);
    expect(related!.args).toEqual(['vitest', 'related', '--run', 'packages/abuddy-sdk/src/types/sdk-entities.ts']);
  });

  it('puts packages:ensure in front of a root run, which npm fires no pretest for', () => {
    expect(plan('packages/abuddy-sdk/src/types/sdk-entities.ts')[0]!.label).toBe(ENSURE_LABEL);
    // and not in front of a package run, whose own `test` script has the hook
    expect(labels('packages/repo-checks/tests/slow-tests.spec.ts')).not.toContain(ENSURE_LABEL);
  });

  it('says what a root run does not cover, rather than leaving it to be discovered', () => {
    const [, related] = plan('packages/abuddy-sdk/src/types/sdk-entities.ts');
    expect(related!.note, 'a pack suite resolves dist, so no import edge runs from this file to its specs')
      .toContain('@app/default-setup');
  });

  // The note used to be set on every root run, including for a package no pack depends on. A warning that is
  // always on is one nobody reads, and this is the half that makes the other half worth printing.
  it('says nothing about the pack suites when the edited package cannot reach one', () => {
    const [, related] = plan('packages/renderer/src/main.ts');
    expect(affectedPackSuites(['renderer']), '@app/default-setup declares no dependency on the renderer').toEqual([]);
    expect(related!.note).toBeUndefined();
  });

  /**
   * Every package, partitioned — not a sample.
   *
   * The first version of this listed nine of the twelve by hand, looked exhaustive, and was missing
   * `abuddy-host`, which reaches `@app/default-setup` transitively through `@abuddy/testing` (whose bundle
   * inlines it). Three doc comments said "four dependencies, so eight cannot reach it" on the strength of
   * that sample. Reading the list from disk is what makes a new package, or a new dependency edge, fail here
   * rather than quietly widen what `--full` runs.
   */
  it('partitions every package into those that reach a pack suite and those that do not', () => {
    const reaches = PACKAGE_DIRS.filter((dir) => affectedPackSuites([dir]).length > 0);
    expect(reaches, 'a dependency edge changed: check the partition is still what you meant, and that no doc '
      + 'comment states a count').toEqual(['abuddy-ears', 'abuddy-host', 'abuddy-sdk', 'abuddy-testing', 'abuddy-ui']);
    // And the rest genuinely say nothing, rather than being absent from a list
    for (const dir of PACKAGE_DIRS.filter((d) => !reaches.includes(d))) {
      expect(affectedPackSuites([dir]), dir).toEqual([]);
    }
  });

  it('never reaches a pack suite from its own source, that being its own suite\'s job', () => {
    for (const suite of UNIT_SUITES.filter((s) => s.kind === 'pack')) {
      expect(affectedPackSuites([suite.dir]), suite.workspace).toEqual([]);
    }
  });

  /**
   * A pack source file plans its own suite, because nothing else can run it.
   *
   * Measured: `vitest related` from the root finds nothing for a pack's backend, frontend or generated FE
   * entry, so the root run this used to plan reported "No test files found, exiting with code 0" — zero specs
   * and a zero exit for the repo's largest suite.
   */
  it('plans a pack source file against its own suite, not a root run that cannot see it', () => {
    for (const suite of UNIT_SUITES.filter((s) => s.kind === 'pack')) {
      const runs = plan(path.relative(REPO_ROOT, someSourceFile(path.join(REPO_ROOT, 'packages', suite.dir, 'src'))));
      expect(runs.map((r) => r.cwd), suite.workspace).toEqual([path.join(REPO_ROOT, 'packages', suite.dir)]);
      expect(runs[0]!.covers, 'it runs the suite in full').toEqual([suite.workspace]);
      expect(runs.some((r) => r.args.includes('related')), 'no root run: none of them imports this').toBe(false);
    }
  });
});

describe('what --full adds', () => {
  const full = (target: string) => planTargets([target], [], REPO_ROOT, { full: true }).runs;

  it('runs the pack suites a rebuilt dist would reach, after the root run', () => {
    const runs = full('packages/abuddy-sdk/src/types/sdk-entities.ts');
    expect(runs.map((r) => r.label)).toEqual([
      ENSURE_LABEL,
      'every spec covering packages/abuddy-sdk/src/types/sdk-entities.ts',
      '@app/default-setup, against a rebuilt dist',
    ]);
    const pack = runs.at(-1)!;
    // Through the pool, not vitest directly: the pool re-reads its own stamp, so an unchanged suite skips
    expect(pack.cwd).toBe(REPO_ROOT);
    expect(pack.args).toEqual(['run', 'test:unit:pack']);
  });

  it('drops the note it would otherwise print, the run below being the answer', () => {
    const [, related] = full('packages/abuddy-sdk/src/types/sdk-entities.ts');
    expect(related!.note, 'telling you to run spec:full while running spec:full').toBeUndefined();
  });

  it('adds nothing when no pack suite depends on what changed', () => {
    expect(full('packages/renderer/src/main.ts').map((r) => r.label))
      .toEqual([ENSURE_LABEL, 'every spec covering packages/renderer/src/main.ts']);
  });

  it('adds nothing for a named spec: naming one is asking for exactly it', () => {
    expect(planTargets(['packages/repo-checks/tests/slow-tests.spec.ts'], [], REPO_ROOT, { full: true }).runs)
      .toHaveLength(1);
  });

  it('is the same plan as without it when the change set touches no pack dependency', () => {
    const args = [['renderer'], [], REPO_ROOT] as const;
    expect(planChanged(...args, { full: true }).runs.map((r) => r.label))
      .toEqual(planChanged(...args).runs.map((r) => r.label));
  });

  it('does not double-run a pack whose own source changed, which is already its own run', () => {
    const labels = planChanged(['default-setup'], [], REPO_ROOT, { full: true }).runs.map((r) => r.label);
    expect(labels.filter((l) => l.includes('default-setup'))).toEqual(['packages/default-setup: (changed)']);
  });

  it('runs a named spec in its own package, which is how you narrow while iterating', () => {
    const runs = plan('packages/repo-checks/tests/slow-tests.spec.ts');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.cwd).toBe(path.join(REPO_ROOT, 'packages', 'repo-checks'));
    expect(runs[0]!.args).toEqual(['test', '--', 'tests/slow-tests.spec.ts']);
  });

  it('reaches a repo script through the graph rather than a hard-coded package', () => {
    // It used to route `scripts/` to @app/repo-checks by name, which was right only while every spec that
    // imported one lived there — an assumption a single exception silently broke.
    expect(labels('scripts/lib/chain-steps.ts')).toEqual([ENSURE_LABEL, 'every spec covering scripts/lib/chain-steps.ts']);
  });

  it('runs both suites a vitest config decides for: its package, and the checks that read every config', () => {
    expect(labels('packages/api/vitest.config.ts'))
      .toEqual(['packages/api: (its config changed)', 'packages/repo-checks: the checks that read every config']);
  });

  // `pack` matched 355 of 368 spec files when the whole repo-relative path was searched, because every path
  // begins with `packages/`. A plausible search term ran the suite, tier 3 included.
  it('reads a name against the file, never the packages/ prefix every path carries', () => {
    const { runs, ambiguous } = planTargets(['pack'], [], REPO_ROOT);
    const matched = ambiguous[0]?.specs ?? runs.flatMap((r) => r.args);
    expect(matched.length).toBeLessThan(40);
    expect(matched.every((f) => path.basename(String(f)).includes('pack'))).toBe(true);
  });

  // `seeder` is the discriminator: one file's stem is exactly that, and flow-seeder.spec.ts merely contains it
  it('prefers the file whose stem is the name over the ones that merely contain it', () => {
    const { runs } = planTargets(['seeder'], [], REPO_ROOT);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.args).toEqual(['test', '--', 'tests/seed/seeder.spec.ts']);
  });

  // The narrowest thing that could fail is the point, so a name wide enough to be a search is answered with the
  // paths rather than by running two dozen specs across eight suites
  it('lists a name that reads as a search instead of running it', () => {
    const { runs, ambiguous } = planTargets(['pack'], [], REPO_ROOT);
    expect(runs).toEqual([]);
    expect(ambiguous[0]!.query).toBe('pack');
    expect(ambiguous[0]!.specs.length).toBeGreaterThan(4);
  });

  it('reports a target that matches nothing instead of passing quietly', () => {
    const { runs, unmatched } = planTargets(['no-such-thing-anywhere'], [], REPO_ROOT);
    expect(unmatched).toEqual(['no-such-thing-anywhere']);
    expect(runs).toEqual([]);
  });

  it('passes flags to vitest untouched, wherever the run lands', () => {
    const [, related] = planTargets(['packages/abuddy-sdk/src/types/sdk-entities.ts'], ['-t', 'a case'], REPO_ROOT).runs;
    expect(related!.args.slice(-2)).toEqual(['-t', 'a case']);
  });
});

describe('what the change set plans', () => {
  it('asks every host project once, and the pack suite only when it changed', () => {
    expect(planChanged([], [], REPO_ROOT).runs.map((r) => r.label))
      .toEqual([ENSURE_LABEL, 'the specs your changes affect']);
    expect(planChanged(['default-setup'], [], REPO_ROOT).runs.map((r) => r.label))
      .toEqual([ENSURE_LABEL, 'the specs your changes affect', 'packages/default-setup: (changed)']);
  });

  it('does not ask a host project separately, because the root run already covers it', () => {
    expect(planChanged(['abuddy-sdk'], [], REPO_ROOT).runs.map((r) => r.label))
      .toEqual([ENSURE_LABEL, 'the specs your changes affect']);
  });
});

describe('packageOf', () => {
  it('names the package a repo path is in, and null for one in none', () => {
    expect(packageOf('packages/abuddy-sdk/src/x.ts')).toBe('abuddy-sdk');
    expect(packageOf('scripts/lib/x.ts')).toBeNull();
    expect(packageOf('tests/e2e/smoke.spec.ts')).toBeNull();
  });
});

describe('how the arguments split', () => {
  it('gives vitest everything from the first flag, so a flag keeps its own value', () => {
    expect(splitArgs(['chain-schedule', '-t', 'a case']))
      .toEqual({ full: false, targets: ['chain-schedule'], flags: ['-t', 'a case'] });
    expect(splitArgs(['--changed', 'HEAD~1']))
      .toEqual({ full: false, targets: [], flags: ['--changed', 'HEAD~1'] });
  });

  it('consumes --full in first position, and nowhere else', () => {
    expect(splitArgs(['--full', 'packages/abuddy-sdk/src/x.ts']))
      .toEqual({ full: true, targets: ['packages/abuddy-sdk/src/x.ts'], flags: [] });
    // Not a target's suffix, and not a flag's value: both stay vitest's to accept or reject, because a
    // command that filtered it out wherever it appeared would eat the second one silently
    expect(splitArgs(['a-spec', '--full'])).toEqual({ full: false, targets: ['a-spec'], flags: ['--full'] });
    expect(splitArgs(['-t', '--full'])).toEqual({ full: false, targets: [], flags: ['-t', '--full'] });
  });
});

/**
 * One property over every plan, rather than a case per mistake.
 *
 * `--full` planned `@app/default-setup`'s 87 specs twice when a dependency *and* the pack changed in one edit
 * — which this repo's no-backward-compatibility rule makes the normal shape of a change, not a corner. The
 * case written to pin it passed for an unrelated reason, so what holds it now is the invariant: a `Run` states
 * which suites it executes in full, and no plan may list one twice. Derived from the package list, so a new
 * package is covered without anyone adding a case.
 */
describe('no plan runs a suite twice', () => {
  const duplicated = (runs: readonly { covers?: readonly string[] }[]): string[] => {
    const seen = new Set<string>();
    return runs.flatMap((run) => (run.covers ?? []).filter((w) => (seen.has(w) ? true : (seen.add(w), false))));
  };

  it('holds for every package, as a change set and as a target, with and without --full', () => {
    for (const dir of PACKAGE_DIRS) {
      for (const full of [false, true]) {
        expect(duplicated(planChanged([dir], [], REPO_ROOT, { full }).runs), `${dir} changed, full=${full}`).toEqual([]);
      }
    }
  });

  it('holds when a pack and one of its dependencies change together', () => {
    for (const suite of UNIT_SUITES.filter((s) => s.kind === 'pack')) {
      for (const dep of PACKAGE_DIRS.filter((d) => affectedPackSuites([d]).includes(suite.workspace))) {
        for (const full of [false, true]) {
          expect(duplicated(planChanged([dep, suite.dir], [], REPO_ROOT, { full }).runs),
            `${dep} + ${suite.dir}, full=${full}`).toEqual([]);
        }
      }
    }
  });

  /**
   * What `covers` means, pinned, because the dedup above is only sound while it means "in full".
   *
   * A run that names specs claims nothing: it is a subset, and running a subset beside the whole suite is
   * wasteful rather than wrong. Were a filtered run to claim coverage, `notYetCovered` would suppress a pack
   * run that genuinely had not happened — which is the same class of silent under-running this whole command
   * was fixed for.
   */
  it('claims coverage only for a run with no spec named', () => {
    const named = planTargets(['packages/default-setup/tests/registries.spec.ts'], [], REPO_ROOT).runs;
    expect(named.map((r) => r.args)).toEqual([['test', '--', 'tests/registries.spec.ts']]);
    expect(named[0]!.covers, 'it runs two of 87 specs').toBeUndefined();
    // and the same package's whole suite does claim it
    expect(planChanged(['default-setup'], [], REPO_ROOT).runs.at(-1)!.covers).toEqual(['@app/default-setup']);
  });

  // The union is still complete: deduplicating must not drop the suite, only the second copy of it
  it('still runs the pack suite when a dependency alone changed', () => {
    const runs = planChanged(['abuddy-sdk'], [], REPO_ROOT, { full: true }).runs;
    expect(runs.flatMap((r) => r.covers ?? [])).toContain('@app/default-setup');
  });
});

/**
 * A tripwire, not a feature: `test-unit-pool.ts` takes `pack`/`host` and `--all` and no project filter, so
 * `packSuiteRun` runs *every* pack suite while its label names only the affected ones. Equal while there is
 * one. This fails when that stops being true, which is the moment the two would start disagreeing.
 */
it('has one pack suite, which is what lets the pool stand in for the affected ones', () => {
  expect(UNIT_SUITES.filter((s) => s.kind === 'pack').map((s) => s.workspace),
    "a second pack suite exists: either give test-unit-pool.ts a project filter, or widen packSuiteRun's "
    + 'label, which names the affected suites while the command runs both').toEqual(['@app/default-setup']);
});

/**
 * The package's own CLAUDE.md names every spec in it.
 *
 * `spec-plan.spec.ts` was added without a row, and ten cases were added to it before a review noticed. This
 * package already checks three lists for
 * stale entries (`NO_SUITE`, `LAYOUT_CHECKS`, `PACKS_AS_A_FIXTURE`); a table describing what is here is the
 * same kind of list and gets the same treatment, in both directions.
 */
describe("the package's CLAUDE.md names what is here", () => {
  const HERE = path.join(REPO_ROOT, 'packages', 'repo-checks');
  const doc = (): string => fs.readFileSync(path.join(HERE, 'CLAUDE.md'), 'utf-8');
  const specs = (): string[] => fs.readdirSync(path.join(HERE, 'tests'))
    .filter((f) => /\.spec\.ts$/.test(f))
    .map((f) => f.replace(/\.(integration\.)?spec\.ts$/, ''));

  it('leaves none of them out', () => {
    const missing = specs().filter((name) => !doc().includes(`\`${name}\``));
    expect(missing, 'add these to the "What is here" table in packages/repo-checks/CLAUDE.md, with what each '
      + 'one\'s subject is').toEqual([]);
  });

  it('names none that has gone', () => {
    const named = [...doc().matchAll(/^\| ((?:`[\w-]+`(?:, )?)+) \|/gm)]
      .flatMap(([, cell]) => [...cell.matchAll(/`([\w-]+)`/g)].map(([, name]) => name));
    expect(named.filter((name) => !specs().includes(name)),
      'these specs are gone or renamed; drop them from the table').toEqual([]);
  });
});
