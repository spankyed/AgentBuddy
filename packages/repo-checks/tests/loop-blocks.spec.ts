import { describe, expect, it } from 'vitest';
import {
  blockFrom, headroom, lastPerPid, parseSamples, ranked, roleOf, RPC_WINDOW_MS, type Sample, TICK_MS,
  verdict,
} from '../../../scripts/lib/loop-blocks.ts';
import { TICK_MS as SAMPLER_TICK_MS } from '../../../scripts/lib/loop-sample.mjs';

/**
 * What `npm run measure:loop` decides, asserted without running anything.
 *
 * It exists because `[vitest-worker]: Timeout calling` was attributed to the wrong side twice — to the
 * worker count, then to contention in general — each time from reading rather than measuring, and the
 * error text names neither the process that failed to answer nor the one that failed to listen. So what
 * is asserted here is the classification and the arithmetic that turn samples into that answer.
 */

const sample = (over: Partial<Sample> & Pick<Sample, 'pid'>): Sample => ({
  ppid: 1, worker: null, file: null, argv: 'node', wallMs: 1000, eluPct: 50,
  loopMaxMs: 0, worstGapMs: 0, p99Ms: 0, ...over,
});

describe('the longest a loop went without turning', () => {
  it('takes the histogram when it saw the block', () => {
    expect(blockFrom({ loopMaxMs: 38_000, worstGapMs: 0 })).toBe(38_000);
  });

  /**
   * The case that makes the second source necessary. `monitorEventLoopDelay` records a gap only once the
   * loop turns again and begins measuring at the first turn, so measured — twice — a 4s spin followed by
   * an exit read 0ms from it. A probe that reports a clean run over a process that blocked until it died
   * is worse than no probe.
   */
  it('falls back to the gap between its own ticks for a block that ran until the process exited', () => {
    expect(blockFrom({ loopMaxMs: 0, worstGapMs: 4000 })).toBe(4000 - TICK_MS);
  });

  it('subtracts one period, because every gap contains the normal wait', () => {
    expect(blockFrom({ loopMaxMs: 0, worstGapMs: TICK_MS + 5 })).toBe(5);
    expect(blockFrom({ loopMaxMs: 0, worstGapMs: 10 }), 'never negative').toBe(0);
  });

  // One period, declared twice — in the sampler, which is plain .mjs, and in the half that subtracts it
  it('subtracts the period the sampler actually ticks at', () => {
    expect(TICK_MS).toBe(SAMPLER_TICK_MS);
  });
});

describe('one row per process', () => {
  it('keeps the newest sample, because the histogram is cumulative', () => {
    const rows = lastPerPid([sample({ pid: 7, loopMaxMs: 10 }), sample({ pid: 7, loopMaxMs: 900 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.loopMaxMs, 'the first sample is a process that had barely started').toBe(900);
  });

  // Null until the worker picks a spec up and null again once it lets go, so the newest line often lacks it
  it('carries forward the spec any sample saw', () => {
    const rows = lastPerPid([sample({ pid: 7, file: 'a.spec.ts' }), sample({ pid: 7, file: null })]);
    expect(rows[0]!.file).toBe('a.spec.ts');
  });
});

/**
 * Derived from the recorded process tree, never from what a process is called.
 *
 * The version of this that matched tinypool's entry file by name would have called every process `other`
 * the day tinypool renamed it, and reported a clean run over a pool it could no longer see — the same
 * failure as the spawn gate that read three of twelve files because it restated what to look for.
 */
describe('what each process was', () => {
  const main = sample({ pid: 100, ppid: 1 });
  const worker = sample({ pid: 200, ppid: 100, worker: '1', argv: 'anything-at-all.js' });
  const spawned = sample({ pid: 300, ppid: 200, worker: '1', argv: 'tsc -p' });
  const roles = Object.fromEntries(roleOf([main, worker, spawned]).map((row) => [row.pid, row.role]));

  it('names a pool worker from the tree, whatever its entry file is called', () => {
    expect(roles[200]).toBe('worker');
  });

  // tinypool sets the id in the worker's env, so a compiler the worker spawns carries it too
  it('does not count what a worker spawned, though it inherits the same worker id', () => {
    expect(roles[300]).toBe('spawned');
  });

  it('names the main process as the parent its workers share', () => {
    expect(roles[100]).toBe('main');
  });

  it('leaves a run with no pool as plain processes', () => {
    expect(roleOf([sample({ pid: 100 })])[0]!.role).toBe('process');
  });
});

describe('what the run licenses you to say', () => {
  const at = (pid: number, blockMs: number): Sample => sample({ pid, loopMaxMs: blockMs });
  const rows = roleOf([at(1, 38_000), at(2, 9500), at(3, 0)]);

  /**
   * The block alone reads as fine until it is not: 38s against a 60s window looks comfortable and is one
   * busy afternoon from failing. Reported as 1.6x, it is a sentence someone can act on.
   */
  it('says how much slower a run would have to be to breach', () => {
    expect(headroom(38_000)).toBeCloseTo(RPC_WINDOW_MS / 38_000, 5);
    expect(headroom(0), 'no slowdown brings a process that never blocked into range').toBe(Infinity);
  });

  it('puts the worst block first, so the first line is the answer', () => {
    expect(ranked(rows).map((row) => row.pid)).toEqual([1, 2, 3]);
  });

  it('separates what breached from what is close', () => {
    const { breached, atRisk, worst } = verdict(rows);
    expect(breached).toEqual([]);
    expect(atRisk.map((row) => row.pid), 'only the one inside the factor').toEqual([1]);
    expect(worst!.pid).toBe(1);
  });

  it('reports a breach as a breach', () => {
    expect(verdict(roleOf([at(1, RPC_WINDOW_MS + 1)])).breached).toHaveLength(1);
  });

  // The window is birpc's DEFAULT_TIMEOUT, hardcoded there and raised by no vitest config
  it('measures against the window vitest actually gives a call', () => {
    expect(RPC_WINDOW_MS).toBe(60_000);
  });
});

describe('reading what the sampler wrote', () => {
  it('skips the partial last line an interrupted run leaves', () => {
    const text = `${JSON.stringify(sample({ pid: 1 }))}\n{"pid":2,"ppi`;
    expect(parseSamples(text).map((row) => row.pid)).toEqual([1]);
  });

  it('is empty for an empty file rather than throwing', () => {
    expect(parseSamples('\n')).toEqual([]);
  });
});
