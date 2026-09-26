import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { affectedPackSuites, ENSURE_LABEL, packageOf, planChanged, planTargets, splitArgs } from '../../../scripts/lib/spec-plan.ts';

/**
 * What `npm run spec` decides to run, asserted without running any of it.
 *
 * The routing is the whole value of that command, and it was wrong for a year in a way nothing could catch:
 * a source file ran its own package's specs, so editing `@abuddy/sdk` ran one of the seven suites covering
 * it and reported green. A plan that is data rather than a loop is what makes the decision checkable, which
 * is why `scripts/lib/spec-plan.ts` exists separately from the command over it.
 */

const plan = (target: string) => planTargets([target], [], REPO_ROOT).runs;
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

  it('derives which pack suites a change reaches from the declared dependencies', () => {
    // The four @app/default-setup declares, so a change to any of them reaches it through a rebuilt dist
    for (const dep of ['abuddy-sdk', 'abuddy-ears', 'abuddy-ui', 'abuddy-testing']) {
      expect(affectedPackSuites([dep]), dep).toEqual(['@app/default-setup']);
    }
    for (const other of ['renderer', 'main', 'api', 'repo-checks', 'publish-checks']) {
      expect(affectedPackSuites([other]), other).toEqual([]);
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
