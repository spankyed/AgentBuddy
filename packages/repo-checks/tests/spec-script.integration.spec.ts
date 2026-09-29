// The one check on `scripts/spec.ts` that runs it as a process, in the shape of
// `import-specifiers-script.integration.spec.ts`. Every other test of the router calls `spec-plan.ts` in
// process and lives in `spec-plan.spec.ts`.
//
// It exists because the in-process cases cannot reach the part most likely to rot. They assert which routes
// promise coverage and what a verdict is worth; what they never execute is the plumbing that turns that into an
// exit code — the reporter arguments, the environment variable carrying the destination, **whether vitest calls
// the reporter at all**, and reading the count back. If a vitest upgrade renames `onFinished`, the reporter
// writes no file, `spec.ts` falls back to "it ran something", and every claiming run reads as a pass again: the
// exact defect exit 3 was added for, silently restored, with nothing failing.
//
// One case, because one is what proves the whole chain end to end. An exit-0 case would spend another ~5s
// re-proving what `spec-plan.spec.ts` already asserts for free.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { planTargets } from '../../../scripts/lib/spec-plan.ts';

/**
 * A file the router promises to have covered and no spec does — derived, not named.
 *
 * A hard-coded path would turn this green for the wrong reason the day something covers it: the run would exit
 * 0 and the case would be asserting nothing. So the target is checked against the plan first, and a target that
 * has since gained a spec fails by name rather than passing quietly.
 */
const UNCOVERED = 'packages/renderer/src/main.ts';

describe('spec as a script', () => {
  it('exits 3 and names the file when nothing covers the target', () => {
    const claimed = planTargets([UNCOVERED], [], REPO_ROOT).runs.some((run) => run.claimsCoverageOf === UNCOVERED);
    expect(claimed, `${UNCOVERED} is no longer planned as a claiming run, so this case proves nothing — `
      + 'point it at another entry module the router claims').toBe(true);

    const result = spawnSync('npm', ['run', '--silent', 'spec', '--', UNCOVERED],
      { cwd: REPO_ROOT, encoding: 'utf-8' });

    expect(result.status, `spec exited ${result.status}. If it is 0, the count never reached spec.ts — the `
      + 'reporter did not run, or its hook was renamed. stderr:\n' + (result.stderr ?? '')).toBe(3);
    expect(result.stderr).toContain(`No spec covers ${UNCOVERED}`);
  });
});
