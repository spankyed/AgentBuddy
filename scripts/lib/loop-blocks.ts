/**
 * What a run of event-loop samples says: which process blocked longest, and how much slower a run
 * would have to be before that block outlasts the window birpc gives a call.
 *
 * The definition, not the command — `scripts/measure-loop.ts` is the command over it, and
 * `scripts/lib/loop-sample.mjs` the half that runs inside the subject. Split so a spec can assert the
 * arithmetic and the classification without running a test suite.
 *
 * **Why this exists.** `[vitest-worker]: Timeout calling "onTaskUpdate"` was blamed twice on the wrong
 * thing in this repo — on the worker count, and then on contention in general — and both times the
 * argument was made without measuring either side of the call. One instrumented run answered it: the
 * main process sat at 6% event-loop utilisation while a worker blocked for 38s. The failure is a worker
 * that cannot listen, not a main process that will not answer, and nothing about the error text says so.
 */

/**
 * The window birpc gives a call, from its `DEFAULT_TIMEOUT = 6e4`.
 *
 * Hardcoded there and passed by none of vitest's four `createBirpc` call sites, so no config raises it:
 * the only lever is the block. Known upstream as vitest-dev/vitest#4497, #6479 and #8164.
 */
export const RPC_WINDOW_MS = 60_000;

/** One line from the sampler. A process writes many; the last is its whole life. */
export interface Sample {
  readonly pid: number;
  readonly ppid: number;
  /** tinypool's worker id, inherited by everything the worker spawns — hence `roleOf` below. */
  readonly worker: string | null;
  /** The spec a vitest worker is running, when the sample caught one. */
  readonly file: string | null;
  readonly argv: string;
  readonly wallMs: number;
  readonly eluPct: number;
  /** `monitorEventLoopDelay`'s worst gap, which is blind to a block still running. */
  readonly loopMaxMs: number;
  /** The worst gap between the sampler's own ticks — that blind spot, seen from the other side. */
  readonly worstGapMs: number;
  readonly p99Ms: number;
}

export type Role = 'main' | 'worker' | 'spawned' | 'process';

export interface Process extends Sample {
  readonly role: Role;
  /** The longest the loop went without turning: the quantity the window is spent against. */
  readonly blockMs: number;
}

/** Must equal the sampler's `TICK_MS`; `loopBlocks.spec.ts` holds the two together. */
export const TICK_MS = 1000;

/**
 * The longest block, from the two sources that each miss what the other catches.
 *
 * `monitorEventLoopDelay` records a gap only once the loop turns *again*, and begins at the first turn,
 * so a block that runs until the process exits is absent from it — measured, a 4s spin then an exit read
 * 0ms. The sampler's worst gap between its own ticks covers that, less one period, which is the wait
 * every gap contains. A lower bound on such a block, and a lower bound is the right error here.
 *
 * Drop the second term and the probe reports a clean run over a process that blocked until it died,
 * which is the one failure a diagnostic must not have.
 */
export const blockFrom = (sample: Pick<Sample, 'loopMaxMs' | 'worstGapMs'>): number =>
  Math.max(sample.loopMaxMs, sample.worstGapMs - TICK_MS, 0);

/**
 * One row per process: its last sample, with the first spec name any sample saw.
 *
 * The last, because the histogram is cumulative and the newest line holds the whole life — reading the
 * first would report a process that had barely started. The file is carried forward instead, since it is
 * null until the worker picks a spec up and null again once it lets go.
 */
export function lastPerPid(samples: readonly Sample[]): Sample[] {
  const rows = new Map<number, Sample>();
  for (const sample of samples) {
    const seen = rows.get(sample.pid);
    rows.set(sample.pid, { ...sample, file: sample.file ?? seen?.file ?? null });
  }
  return [...rows.values()];
}

/**
 * What each process was, derived from the recorded process tree rather than from what it is called.
 *
 * A pool worker is the **topmost** process carrying a tinypool worker id: the id is set in the worker's
 * env, so a compiler or a nested vitest the worker spawns inherits it and is not one. The main process is
 * the parent those workers share. Nothing here names an entry file, because a list of names is a restated
 * population — the version of this that read `process.js` would have called every process `other` the day
 * tinypool renamed its entry, and reported a clean run over a suite it could no longer see.
 */
export function roleOf(rows: readonly Sample[]): Process[] {
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const isWorker = (row: Sample): boolean =>
    row.worker !== null && byPid.get(row.ppid)?.worker !== row.worker;
  const mains = new Set(rows.filter(isWorker).map((row) => row.ppid));
  return rows.map((row) => ({
    ...row,
    blockMs: blockFrom(row),
    role: isWorker(row) ? 'worker'
      : row.worker !== null ? 'spawned'
        : mains.has(row.pid) ? 'main' : 'process',
  }));
}

/**
 * How much slower a run could get before this block outlasts the window — the number worth acting on.
 *
 * A block is only ever reported beside it, because the block alone reads as fine until it is not: 38s
 * looks comfortable against 60s and is one busy afternoon away from failing, and this says so as 1.6x.
 * `Infinity` for a process that never blocked, which no slowdown brings into range.
 */
export const headroom = (blockMs: number): number => (blockMs <= 0 ? Infinity : RPC_WINDOW_MS / blockMs);

/** Worst block first: the only order in which the first line is the answer. */
export const ranked = (rows: readonly Process[]): Process[] =>
  [...rows].sort((a, b) => b.blockMs - a.blockMs);

/**
 * What the run is worth saying out loud.
 *
 * `breached` is the certainty and `atRisk` the warning, and both are needed: a run where nothing breached
 * says nothing about the next one, which is the mistake this whole line of work started from — nineteen
 * clean runs were read as evidence the flake was gone.
 */
export function verdict(rows: readonly Process[], atRiskBelow = 3): {
  readonly worst: Process | undefined;
  readonly breached: Process[];
  readonly atRisk: Process[];
} {
  const order = ranked(rows);
  return {
    worst: order[0],
    breached: order.filter((row) => row.blockMs >= RPC_WINDOW_MS),
    atRisk: order.filter((row) => row.blockMs < RPC_WINDOW_MS && headroom(row.blockMs) < atRiskBelow),
  };
}

/** Whatever the sampler wrote, minus the partial last line an interrupted run leaves. */
export function parseSamples(text: string): Sample[] {
  return text.split('\n').flatMap((line) => {
    if (line.trim() === '') return [];
    try {
      return [JSON.parse(line) as Sample];
    } catch {
      return [];
    }
  });
}
