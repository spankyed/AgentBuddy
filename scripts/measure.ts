#!/usr/bin/env node
/**
 * Times a command on a quiet machine, several times, and prints a number you can quote.
 *
 *     npm run measure -- "<command>"                      # 5 runs
 *     npm run measure -- --runs 10 "<command>"
 *     npm run measure -- --against "<command B>" "<A>"    # interleaved A/B, paired difference
 *     npm run measure -- --idle 50 "<command>"            # lower the floor deliberately
 *     npm run measure -- --force "<command>"              # measure anyway; the citation records it
 *
 * **It refuses a busy box.** Five numbers in `goal-integration-pool` were wrong and three reached commit
 * messages, every one from a hand-rolled `date +%s` loop taken while something else used the CPU. The
 * refusal is the point of this tool; `--force` exists so it is an override rather than an obstacle, and a
 * forced number says so wherever it is quoted.
 *
 * **An A/B comparison interleaves.** Running all of A and then all of B lets a drifting machine into the
 * answer — measured, that turned a 49.1s→48.2s difference into a reported 71s→46.1s one. Alternating makes
 * each pair share its conditions, and the difference reported is the median of the pairs.
 *
 * It is not a chain step. It is a tool for the moment before you write a number down.
 * `scripts/lib/measure.ts` holds every decision it makes, so a spec can watch those fail.
 */
import { spawnSync } from 'node:child_process';
import {
  citation, driftedDuring, idleNow, IDLE_FLOOR, pairedDelta, refusesAsBusy, runOrder, summarise,
} from './lib/measure.ts';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};
const has = (name: string): boolean => argv.includes(`--${name}`);

const runs = Number(flag('runs') ?? 5);
const floor = flag('idle') === undefined ? IDLE_FLOOR : Number(flag('idle')) / 100;
const force = has('force');
const against = flag('against');

/** Everything that is not a flag or a flag's value: the command, and with `--against` it is the A arm */
const values = new Set(['--runs', '--idle', '--against'].flatMap((name) => {
  const at = argv.indexOf(name);
  return at === -1 ? [] : [at, at + 1];
}));
const commands = argv.filter((_, i) => !values.has(i) && argv[i] !== '--force');

if (commands.length !== 1 || !Number.isFinite(runs) || runs < 1 || !Number.isFinite(floor)) {
  console.error('usage: npm run measure -- [--runs N] [--idle PERCENT] [--force] [--against "<command B>"] "<command>"');
  process.exit(2);
}

const started = idleNow();
if (refusesAsBusy({ idle: started, floor, force })) {
  console.error(`The machine is ${Math.round(started * 100)}% idle and this refuses below `
    + `${Math.round(floor * 100)}%. A number taken now is about the machine, not the command.\n`
    + '  Wait, or pass --force (the citation will say it was forced), or --idle to lower the floor.');
  process.exit(1);
}

const time = (command: string): number => {
  const at = Date.now();
  const result = spawnSync(command, { shell: true, stdio: 'ignore' });
  if (result.status !== 0) throw new Error(`the command failed (exit ${result.status ?? 'signal'}): ${command}`);
  return Date.now() - at;
};

const samples: Record<'a' | 'b', number[]> = { a: [], b: [] };
const idles: number[] = [started];
for (const arm of runOrder(runs, against !== undefined)) {
  samples[arm].push(time(arm === 'a' ? commands[0]! : against!));
  idles.push(idleNow());
}

const on = new Date().toISOString().slice(0, 10);
const drifted = driftedDuring(idles, floor);
const worst = Math.min(...idles);

/** The conditions are the series', not each arm's: both arms ran through the same window */
const quote = (series: number[]): string =>
  citation({ summary: summarise(series), idle: worst, on, forced: force, drifted });

console.log('');
if (against === undefined) {
  console.log(`  ${commands[0]}`);
  console.log(`  ${quote(samples.a)}`);
} else {
  const delta = pairedDelta(samples.a, samples.b);
  console.log(`  A  ${commands[0]}`);
  console.log(`     ${quote(samples.a)}`);
  console.log(`  B  ${against}`);
  console.log(`     ${quote(samples.b)}`);
  // The paired difference, not the difference of the medians: pairing is why the arms interleave
  const sign = delta.ms >= 0 ? '+' : '';
  console.log(`\n  B - A: ${sign}${(delta.ms / 1000).toFixed(1)}s (${sign}${Math.round(delta.fraction * 100)}% of A), paired over ${runs}`);
}
if (drifted) {
  console.log(`\n  Conditions moved while this ran — idle fell to ${Math.round(worst * 100)}%. Treat the spread, `
    + 'not the median, as the answer, or re-run when the box is quiet.');
}
