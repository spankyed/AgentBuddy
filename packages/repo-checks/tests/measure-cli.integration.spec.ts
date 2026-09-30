import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/**
 * What each measure command exits with, run as a process.
 *
 * **An exit code is only real at the process boundary**, which is why this is here rather than a pure
 * function spec'd in the fast half: a mapping asserted in-process re-proves arithmetic and watches
 * nothing. Nothing watched it, and it collapsed — for a while a bad flag, a box too busy to measure on
 * and a command that failed all exited 2, so a caller could not tell which had happened, and the refusal
 * had been 1 the commit before.
 *
 * The commands here are chosen to finish instantly. What is asserted is the code, never a duration.
 *
 * **Every case but the refusal passes `--force`**, because these run inside the integration pool and a
 * pool is exactly the busy box the tools refuse to measure on. Without it three of them returned 3 — the
 * tool being right and the test being wrong, which is worth knowing before the next person reads a 3 here
 * as a bug.
 */

const TSX = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const run = (script: string, args: readonly string[]): number =>
  spawnSync(TSX, [path.join(REPO_ROOT, 'scripts', script), ...args], { cwd: REPO_ROOT, stdio: 'pipe' }).status ?? -1;

const measure = (...args: string[]): number => run('measure.ts', ['--force', ...args]);
const measureLoop = (...args: string[]): number => run('measure-loop.ts', ['--force', ...args]);
/** The gate is the subject of one case, so that one must not wave it away */
const unforced = (script: string, ...args: string[]): number => run(script, args);

describe('npm run measure', () => {
  it('exits 0 when it produced a number', () => {
    expect(measure('--runs', '1', 'node -e 0')).toBe(0);
  });

  it('exits 1 when the command failed, because a failed run has no duration', () => {
    expect(measure('--runs', '1', 'node -e "process.exit(7)"')).toBe(1);
  });

  it('exits 2 on an argument it cannot read', () => {
    expect(measure('--runz', '1', 'node -e 0')).toBe(2);
    expect(measure('node -e 0', '--busy'), 'a flag with no value is not a default').toBe(2);
  });

  /**
   * The one that has to be its own code. A script that retries when the box is busy has nothing to retry
   * on if this is the same answer as a typo — and it was, for a commit.
   */
  it('exits 3 when it refused because the machine was busy', () => {
    expect(unforced('measure.ts', '--idle', '99', '--runs', '1', 'node -e 0')).toBe(3);
  });

  it('exits 1 when trials found failures, since that is the answer rather than an error', () => {
    expect(measure('--trials', '1', 'node -e "process.exit(1)"')).toBe(1);
    expect(measure('--trials', '1', 'node -e 0')).toBe(0);
  });
});

describe('npm run measure:loop', () => {
  it('exits 0 when it produced a report', () => {
    expect(measureLoop('node -e 0')).toBe(0);
  });

  /**
   * It reports on a command rather than wrapping one — `perf report` against `time(1)` — and its answer is
   * the table, with the command's ending already in the first line. Propagating that code put the
   * command's outcome and the tool's own errors in one integer, so a command exiting 2 was
   * indistinguishable from a flag it could not read.
   */
  it('exits on its own outcome, not the code of the command it watched', () => {
    expect(measureLoop('node -e "process.exit(5)"')).toBe(0);
  });

  it('exits 1 when it has nothing to report on', () => {
    expect(measureLoop('true'), 'no node process, so no samples').toBe(1);
  });

  it('exits 2 on an argument it cannot read, and 3 when it refused', () => {
    expect(measureLoop('--runz', '1', 'node -e 0')).toBe(2);
    expect(unforced('measure-loop.ts', '--idle', '99', 'node -e 0')).toBe(3);
  });
});
