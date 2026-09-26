import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { ENSURE_LABEL, PACK_SUITE_NOTE, packageOf, planChanged, planTargets } from '../../../scripts/lib/spec-plan.ts';

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
    expect(related!.note).toBe(PACK_SUITE_NOTE);
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
