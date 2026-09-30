/**
 * Preloaded into every node process a measured command starts (`--import`), and the only half of
 * `npm run measure:loop` that runs inside the subject.
 *
 * It records how long that process's event loop went without turning. That is the quantity behind
 * `[vitest-worker]: Timeout calling` — birpc gives a call 60s, vitest hardcodes it, and a worker that
 * blocks its own loop past that window cannot read a reply that has already arrived.
 *
 * **Sampled on a timer, never only at exit.** tinypool kills its forked workers with a signal, and a
 * signal does not run `process.on('exit')` — so an exit-only probe records every process in the run
 * except the one the question is about. That was the first version, and it reported nothing.
 *
 * **Two sources for one number, because each is blind where the other sees.**
 * `monitorEventLoopDelay` records a gap only once the loop turns *again*, and it starts measuring at the
 * first turn: measured, a 4s spin followed by an exit reported 0ms from it, twice over. The interval
 * below is the loop turning, so the worst gap between ticks covers both cases. It is kept cumulatively
 * rather than read from the newest line, because a gap is momentary where the histogram is not, and the
 * newest line is what a reader takes.
 *
 * Plain `.mjs` because it is loaded by whatever the command spawns, which has no TypeScript loader.
 * `LOOP_SAMPLES` is both the destination and the switch: without it this is inert, so a stray
 * `NODE_OPTIONS` in someone's shell costs nothing.
 */
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { appendFileSync } from 'node:fs';

/** How often a process reports. `blockFrom` subtracts it from a gap, so the two must agree. */
export const TICK_MS = 1000;

const out = process.env.LOOP_SAMPLES;
if (out) {
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const from = performance.eventLoopUtilization();
  const startedAt = Date.now();
  let tickedAt = startedAt;
  let worstGapMs = 0;

  /** @returns {{ filepath?: string } | undefined} */
  const vitestState = () => Reflect.get(globalThis, '__vitest_worker__');

  const write = () => {
    try {
      worstGapMs = Math.max(worstGapMs, Date.now() - tickedAt);
      appendFileSync(out, `${JSON.stringify({
        pid: process.pid,
        ppid: process.ppid,
        // Set by tinypool in the worker's own env, so everything a worker spawns inherits it — which is
        // what makes a worker the topmost process carrying one, rather than anything named in advance
        worker: process.env.TINYPOOL_WORKER_ID ?? null,
        // Vitest's own state, read defensively: absent in every process that is not running a test file
        file: vitestState()?.filepath ?? null,
        argv: process.argv.slice(1, 3).map((arg) => arg.split('/').pop()).join(' '),
        wallMs: Date.now() - startedAt,
        eluPct: Math.round(performance.eventLoopUtilization(from).utilization * 100),
        loopMaxMs: Math.round(delay.max / 1e6),
        worstGapMs,
        p99Ms: Math.round(delay.percentile(99) / 1e6),
      })}\n`);
    } catch {
      // A probe that fails the run it is watching is worse than no probe
    }
  };

  // Written before the tick is recorded, so the sample carries the gap it just observed
  setInterval(() => { write(); tickedAt = Date.now(); }, TICK_MS).unref();
  process.on('exit', write);
}
