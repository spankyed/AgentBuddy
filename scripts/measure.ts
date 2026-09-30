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
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  citation, driftedDuring, groupBySignature, idleNow, IDLE_FLOOR, pairedDelta, rateOf, refusesAsBusy,
  runOrder, summarise, upperBound, type Trial,
} from './lib/measure.ts';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};
const has = (name: string): boolean => argv.includes(`--${name}`);

const runs = Number(flag('runs') ?? 5);
const floor = flag('idle') === undefined ? IDLE_FLOOR : Number(flag('idle')) / 100;
const busy = flag('busy') === undefined ? 0 : Number(flag('busy'));
// `--busy` deliberately does what the rest of this refuses, so it carries its own permission. The citation
// says the run was under induced load, and the idle reading below is the load it actually achieved rather
// than the one it asked for
const force = has('force') || busy > 0;
const against = flag('against');
const trials = flag('trials') === undefined ? undefined : Number(flag('trials'));
const stopOnFailure = has('stop-on-failure');

/** Everything that is not a flag or a flag's value: the command, and with `--against` it is the A arm */
const values = new Set(['--runs', '--idle', '--against', '--trials', '--busy'].flatMap((name) => {
  const at = argv.indexOf(name);
  return at === -1 ? [] : [at, at + 1];
}));
const own = new Set(['--force', '--stop-on-failure']);
const commands = argv.filter((_, i) => !values.has(i) && !own.has(argv[i]!));

const usage = 'usage: npm run measure -- [--runs N | --trials N [--stop-on-failure]] [--idle PERCENT] '
  + '[--busy N] [--force] [--against "<command B>"] "<command>"';
if (commands.length !== 1 || !Number.isFinite(runs) || runs < 1 || !Number.isFinite(floor)
  || !Number.isFinite(busy) || busy < 0
  || (trials !== undefined && (!Number.isFinite(trials) || trials < 1))) {
  console.error(usage);
  process.exit(2);
}
// Two questions, and an A/B of failure *rates* is a third nobody has asked for yet
if (trials !== undefined && against !== undefined) {
  console.error('--trials asks how often a command fails and --against compares two durations; pick one.');
  process.exit(2);
}

/**
 * N processes burning a core each, so contention is *induced* rather than waited for.
 *
 * The birpc timeout this exists to study had only ever been seen by accident — another agent's suite, the
 * chain's own lanes — which is why the evidence for it was one failure in two runs. A condition you can
 * produce is a condition you can measure.
 *
 * Killed in a `finally` and on a signal: a burner that outlives its run is worse than the flake, and
 * `process.on('exit')` alone does not fire for SIGINT.
 */
const burners: ChildProcess[] = [];
const stopBurning = (): void => { for (const child of burners.splice(0)) child.kill('SIGKILL'); };
if (busy > 0) {
  process.on('exit', stopBurning);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => { stopBurning(); process.exit(130); });
  }
  for (let i = 0; i < busy; i += 1) {
    burners.push(spawn(process.execPath, ['-e', 'for(;;);'], { stdio: 'ignore' }));
  }
}

const started = idleNow();
if (refusesAsBusy({ idle: started, floor, force })) {
  console.error(`The machine is ${Math.round(started * 100)}% idle and this refuses below `
    + `${Math.round(floor * 100)}%. A number taken now is about the machine, not the command.\n`
    + '  Wait, or pass --force (the citation will say it was forced), or --idle to lower the floor.');
  process.exit(1);
}

/** Timing mode throws on failure: a failed run has no duration worth reporting. */
const time = (command: string): number => {
  const at = Date.now();
  const result = spawnSync(command, { shell: true, stdio: 'ignore' });
  if (result.status !== 0) throw new Error(`the command failed (exit ${result.status ?? 'signal'}): ${command}`);
  return Date.now() - at;
};

/** Trials mode tolerates it, because the failure is the measurement. 64MB: a test suite is chatty. */
const trial = (command: string): Trial => {
  const at = Date.now();
  const result = spawnSync(command, { shell: true, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return {
    ms: Date.now() - at,
    code: result.status ?? 1,
    stderr: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
};

if (trials !== undefined) {
  const taken: Trial[] = [];
  const seen: number[] = [started];
  for (let i = 0; i < trials; i += 1) {
    taken.push(trial(commands[0]!));
    seen.push(idleNow());
    if (stopOnFailure && taken.at(-1)!.code !== 0) break;
  }
  const failures = taken.filter((t) => t.code !== 0).length;
  const worstIdle = Math.min(...seen);
  console.log(`\n  ${commands[0]}`);
  console.log(`  ${failures} of ${taken.length} failed (${Math.round(rateOf(taken) * 100)}%, at most `
    + `${Math.round(upperBound(failures, taken.length) * 100)}% at 95% confidence), `
    + `${Math.round(worstIdle * 100)}% idle, ${new Date().toISOString().slice(0, 10)}`
    + `${driftedDuring(seen, floor) ? ' — conditions drifted mid-series' : ''}`);
  // One group per distinct failure, with the text verbatim: the grouping is a convenience and the
  // exemplar is the evidence. Whether these are one bug or three is the reader's call, not this tool's
  for (const group of groupBySignature(taken)) {
    console.log(`\n  ${group.count}x  ${group.signature.slice(0, 140)}`);
    for (const line of group.exemplar.split('\n').slice(-6)) console.log(`      ${line}`);
  }
  stopBurning();
  process.exit(failures > 0 ? 1 : 0);
}

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
  `${citation({ summary: summarise(series), idle: worst, on, forced: force, drifted })}`
  + `${busy > 0 ? ` — under ${busy} induced busy cores` : ''}`;

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
stopBurning();
