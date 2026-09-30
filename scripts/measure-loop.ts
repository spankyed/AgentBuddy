#!/usr/bin/env node
/**
 * Runs a command and reports, per process it started, the longest its event loop went without turning —
 * against the 60s window birpc gives a call.
 *
 *     npm run measure:loop -- "npm run test:integration"
 *     npm run measure:loop -- --busy 12 "npm run test:integration"   # under induced load
 *     npm run measure:loop -- --keep "npm run test:integration"      # keep the raw samples
 *
 * **What it answers.** `[vitest-worker]: Timeout calling "onTaskUpdate"` names neither the process that
 * failed to answer nor the one that failed to listen, and in this repo it was attributed to the wrong
 * side twice — to the worker count, then to contention in general — each time from reading rather than
 * measuring. One run of this settled it: the main process at 6% utilisation, a worker blocked 38s. It is
 * the worker's own synchronous work that spends the window, and `await` on a resolved promise drains
 * microtasks without turning the loop, so a file of synchronous cases is one block however many `it`s it
 * holds.
 *
 * It reports headroom rather than the block alone, because the block alone reads as fine until it is
 * not: 38s against a 60s window is 1.6x from failing, and that is the sentence worth acting on.
 *
 * Not a chain step, and it measures nothing about duration — `npm run measure` is that, and this is for
 * the moment a run failed for a reason that was not the code. `scripts/lib/loop-blocks.ts` holds every
 * decision it makes; `scripts/lib/loop-sample.mjs` is the half that runs inside the subject.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { boundedSpawn } from './lib/bounded-spawn.ts';
import {
  asNumber, conditions, ExitWith, idleNow, IDLE_FLOOR, parseFlags, refusesAsBusy, startBurners,
} from './lib/measure.ts';
import { factorText, lastPerPid, parseSamples, ranked, roleOf, verdictLine } from './lib/loop-blocks.ts';

const USAGE = 'usage: npm run measure:loop -- [--busy N] [--idle PERCENT] [--timeout MINUTES] '
  + '[--force] [--keep] "<command>"';

/** As in `measure`: a bound, so a wedged command cannot hang the tool that was watching it. */
const DEFAULT_TIMEOUT_MINUTES = 30;

const WIDTH = 46;
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
const pad = (text: string, width: number): string => text.padEnd(width);
/** From the workspace down, since that is what names a spec; the tail when even that is too long */
const shortPath = (full: string): string => {
  const inside = full.split('/packages/').at(-1) ?? full;
  return inside.length <= WIDTH ? inside : `…${inside.slice(-(WIDTH - 1))}`;
};

async function main(): Promise<void> {
  const parsed = parseFlags(process.argv.slice(2), {
    values: ['busy', 'idle', 'timeout'],
    booleans: ['force', 'keep'],
  });
  const busy = asNumber(parsed.values.busy, 'busy') ?? 0;
  const percent = asNumber(parsed.values.idle, 'idle');
  const floor = percent === undefined ? IDLE_FLOOR : percent / 100;
  const minutes = asNumber(parsed.values.timeout, 'timeout') ?? DEFAULT_TIMEOUT_MINUTES;
  const keep = parsed.flags.has('keep');
  // As in `measure`: induced load deliberately does what the gate refuses, so it carries its own permission
  const force = parsed.flags.has('force') || busy > 0;

  if (parsed.positionals.length !== 1 || busy < 0 || minutes <= 0) throw new ExitWith(USAGE, 2);
  const command = parsed.positionals[0]!;
  const budgetMs = minutes * 60_000;

  const burners = new AbortController();
  // A burner resolving while the run is still going means its ceiling ran out, not that we stopped it
  let running = true;
  let loadExpired = false;
  for (const burner of startBurners(busy, burners.signal)) {
    void burner.then(() => { if (running) loadExpired = true; });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-blocks-'));
  const samplesAt = path.join(dir, 'samples.jsonl');
  /** Kept when asked for, or when something could not be read and the raw file is the only way to look */
  let hold = keep;
  try {
    const started = idleNow();
    if (refusesAsBusy({ idle: started, floor, force })) {
      throw new ExitWith(`The machine is ${Math.round(started * 100)}% idle and this refuses below `
        + `${Math.round(floor * 100)}%. Blocks measured now are about the machine, not the command.\n`
        + '  Wait, or pass --busy to induce load deliberately, or --force.', 3);
    }

    fs.writeFileSync(samplesAt, '');
    // Appended, never replaced: the command may need conditions of its own, and this repo's do
    const nodeOptions = `${process.env.NODE_OPTIONS ?? ''} --import ${new URL('./lib/loop-sample.mjs', import.meta.url).href}`;
    const run = await boundedSpawn('sh', ['-c', command], budgetMs, {
      stream: true,
      env: { ...process.env, NODE_OPTIONS: nodeOptions.trim(), LOOP_SAMPLES: samplesAt },
    });

    running = false;
    const { samples, dropped } = parseSamples(fs.readFileSync(samplesAt, 'utf-8'));
    hold ||= dropped > 0;
    const rows = roleOf(lastPerPid(samples));
    if (rows.length === 0) {
      throw new ExitWith('No process recorded a sample. The command started no node process, or started '
        + 'one that strips NODE_OPTIONS.', 1);
    }

    const ending = run.timedOut === true ? `— timed out after ${minutes} minutes`
      : run.code === 0 ? '' : `— exited ${run.code}`;
    console.log(`\n  ${command}  ${ending}`);
    // No "% of the window" column: it and the factor are one quantity inverted, and dropping it gives
    // the factor a header of its own rather than an unlabelled share of the block's. ELU earns its place
    // by saying *why* a process was quiet — a loop at 4% was waiting, one at 99% was working, and only
    // the second is a block anyone can shorten. It is the number that settled which side of the rpc failed
    console.log(`\n  ${pad('process', 8)} ${pad('what it was running', WIDTH)} ${pad('worst block', 12)} `
      + `${pad('breaches at', 12)} ${pad('elu', 5)} p99`);
    for (const row of ranked(rows).slice(0, 10)) {
      const factor = factorText(row.blockMs);
      console.log(`  ${pad(row.role, 8)} ${pad(shortPath(row.file ?? row.argv), WIDTH)} `
        + `${pad(seconds(row.blockMs), 12)} ${pad(factor === '' ? '' : `${factor} slower`, 12)} `
        + `${pad(`${row.eluPct}%`, 5)} ${seconds(row.p99Ms)}`);
    }

    // One sample, and it says so. There is one run here, so there is no moment between runs to sample,
    // and a reading taken *during* it measures the command — a quiet box reads 0% idle while a test suite
    // uses it. The burners are already spinning when it is taken, so it is still what `--busy` achieved
    console.log(`\n  ${rows.length} processes, ${rows.filter((row) => row.role === 'worker').length} pool `
      + `workers, ${conditions({ idles: [started], floor, busy, forced: force, loadExpired })} before the run`);
    console.log(`  ${verdictLine(rows)}`);
    if (dropped > 0) {
      console.log(`  ${dropped} sample lines could not be read, so that many processes may be missing here.`);
    }
    if (hold) console.log(`\n  Samples kept at ${samplesAt}`);
    // The tool's own outcome, never the command's. This is a reporting tool rather than a wrapper — the
    // command's ending is the report's first line — and one integer carrying both meanings is how a
    // command exiting 2 became indistinguishable from bad flags
    process.exitCode = 0;
  } finally {
    burners.abort();
    // `spec.ts` does the same unconditionally; the difference here is that the raw samples are the
    // evidence when the report itself looks wrong, so there is a way to ask for them
    if (!hold) fs.rmSync(dir, { recursive: true, force: true });
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error instanceof ExitWith ? error.code : 2;
});
