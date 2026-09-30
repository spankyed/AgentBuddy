#!/usr/bin/env node
/**
 * Runs a command and reports, per process it started, the longest its event loop went without turning —
 * against the 60s window birpc gives a call.
 *
 *     npm run measure:loop -- "npm run test:integration"
 *     npm run measure:loop -- --busy 12 "npm run test:integration"   # under induced load
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
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { idleNow, IDLE_FLOOR, refusesAsBusy, startBurners } from './lib/measure.ts';
import { headroom, lastPerPid, parseSamples, ranked, roleOf, RPC_WINDOW_MS, verdict } from './lib/loop-blocks.ts';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};
const busy = flag('busy') === undefined ? 0 : Number(flag('busy'));
const floor = flag('idle') === undefined ? IDLE_FLOOR : Number(flag('idle')) / 100;
// As in `measure`: induced load deliberately does what the gate refuses, so it carries its own permission
const force = argv.includes('--force') || busy > 0;

const values = new Set(['--busy', '--idle'].flatMap((name) => {
  const at = argv.indexOf(name);
  return at === -1 ? [] : [at, at + 1];
}));
const commands = argv.filter((_, i) => !values.has(i) && argv[i] !== '--force');

if (commands.length !== 1 || !Number.isFinite(busy) || busy < 0 || !Number.isFinite(floor)) {
  console.error('usage: npm run measure:loop -- [--busy N] [--idle PERCENT] [--force] "<command>"');
  process.exit(2);
}

const stopBurning = startBurners(busy);
const started = idleNow();
if (refusesAsBusy({ idle: started, floor, force })) {
  console.error(`The machine is ${Math.round(started * 100)}% idle and this refuses below `
    + `${Math.round(floor * 100)}%. Blocks measured now are about the machine, not the command.\n`
    + '  Wait, or pass --busy to induce load deliberately, or --force.');
  process.exit(1);
}

const samplesAt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loop-blocks-')), 'samples.jsonl');
fs.writeFileSync(samplesAt, '');
// Appended, never replaced: the command may need conditions of its own, and this repo's do
const nodeOptions = `${process.env.NODE_OPTIONS ?? ''} --import ${new URL('./lib/loop-sample.mjs', import.meta.url).href}`;
const run = spawnSync(commands[0]!, {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: nodeOptions.trim(), LOOP_SAMPLES: samplesAt },
});
stopBurning();

const rows = roleOf(lastPerPid(parseSamples(fs.readFileSync(samplesAt, 'utf-8'))));
if (rows.length === 0) {
  console.error('\nNo process recorded a sample. The command started no node process, or started one that '
    + 'strips NODE_OPTIONS.');
  process.exit(1);
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
const pad = (text: string, width: number): string => text.padEnd(width);
const WIDTH = 54;
/** From the workspace down, since that is what names a spec; the tail when even that is too long */
const shortPath = (full: string): string => {
  const inside = full.split('/packages/').at(-1) ?? full;
  return inside.length <= WIDTH ? inside : `…${inside.slice(-(WIDTH - 1))}`;
};
const { worst, breached, atRisk } = verdict(rows);

console.log(`\n  ${commands[0]}  ${run.status === 0 ? '' : `— exited ${run.status ?? 'on a signal'}`}`);
console.log(`\n  ${pad('process', 8)} ${pad('what it was running', WIDTH)} ${pad('worst block', 12)} of the window`);
for (const row of ranked(rows).slice(0, 10)) {
  const factor = headroom(row.blockMs);
  console.log(`  ${pad(row.role, 8)} ${pad(shortPath(row.file ?? row.argv), WIDTH)} `
    + `${pad(seconds(row.blockMs), 12)} ${pad(`${Math.round((row.blockMs / RPC_WINDOW_MS) * 100)}%`, 5)}`
    + `${factor === Infinity ? '' : `  ${factor.toFixed(1)}x slower breaches`}`);
}

console.log(`\n  ${rows.length} processes, ${rows.filter((row) => row.role === 'worker').length} pool workers, `
  + `${Math.round(started * 100)}% idle${busy > 0 ? ` under ${busy} induced busy cores` : ''}`);
if (breached.length > 0) {
  console.log(`  ${breached.length} past the ${seconds(RPC_WINDOW_MS)} window — these fail as `
    + '"[vitest-worker]: Timeout calling", whatever their tests did.');
} else if (atRisk.length > 0 && worst !== undefined) {
  console.log(`  Nothing breached, and a run ${headroom(worst.blockMs).toFixed(1)}x slower would. A clean run `
    + 'here is not evidence the flake is gone; it is one measurement of how much room is left.');
}
process.exit(run.status ?? 1);
