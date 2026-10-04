#!/usr/bin/env node
/**
 * Times a command on a quiet machine, several times, and prints a number you can quote.
 *
 *     npm run measure -- "<command>"                      # 5 runs
 *     npm run measure -- --runs 10 "<command>"
 *     npm run measure -- --against "<command B>" "<A>"    # interleaved A/B, paired difference
 *     npm run measure -- --trials 20 --busy 12 "<cmd>"    # how often it fails, under induced load
 *     npm run measure -- --idle 50 "<command>"            # lower the floor deliberately
 *     npm run measure -- --force "<command>"              # measure anyway; the citation records it
 *
 * **It refuses a busy box.** Five numbers in `goal-integration-pool` were wrong and three reached commit
 * messages, every one from a hand-rolled `date +%s` loop taken while something else used the CPU.
 *
 * **An A/B comparison interleaves.** Running all of A then all of B lets a drifting machine into the
 * answer — measured, that turned a 49.1s→48.2s difference into a reported 71s→46.1s one.
 *
 * Exit 0 when it produced an answer, 1 otherwise — and in trials mode 1 when trials failed, since that is
 * the answer. `scripts/lib/measure.ts` holds every decision it makes, so a spec can watch those fail.
 */
import {
  asNumber, citation, conditions, coresBusySince, cpuNow, groupBySignature, idleNow, IDLE_FLOOR,
  pairedDelta, parseFlags, rateOf, refusesAsBusy, runOrder, startBurners, summarise, upperBound, type Trial,
} from './lib/measure.ts';
import { boundedSpawn } from './lib/bounded-spawn.ts';

const USAGE = 'usage: npm run measure -- [--runs N | --trials N] [--idle PERCENT] [--busy N] [--force] '
  + '[--against "<command B>"] "<command>"';

/** A bound, because a run that can hang cannot fail. Wide enough that nothing here has come near it. */
const BUDGET_MS = 30 * 60_000;

async function main(): Promise<void> {
  const parsed = parseFlags(process.argv.slice(2), {
    values: ['runs', 'idle', 'against', 'trials', 'busy'],
    booleans: ['force'],
  });
  const runs = asNumber(parsed.values.runs, 'runs') ?? 5;
  const trials = asNumber(parsed.values.trials, 'trials');
  const busy = asNumber(parsed.values.busy, 'busy') ?? 0;
  const percent = asNumber(parsed.values.idle, 'idle');
  const floor = percent === undefined ? IDLE_FLOOR : percent / 100;
  const against = parsed.values.against;
  // `--busy` deliberately does what the rest of this refuses, so it carries its own permission
  const force = parsed.flags.has('force') || busy > 0;

  if (parsed.positionals.length !== 1 || runs < 1 || busy < 0 || (trials !== undefined && trials < 1)) {
    throw new Error(USAGE);
  }
  // Two questions, and an A/B of failure *rates* is a third nobody has asked for yet
  if (trials !== undefined && against !== undefined) {
    throw new Error('--trials asks how often a command fails and --against compares two durations; pick one.');
  }
  const command = parsed.positionals[0]!;

  const burners = new AbortController();
  startBurners(busy, burners.signal);
  try {
    const started = idleNow();
    if (refusesAsBusy({ idle: started, floor, force })) {
      throw new Error(`The machine is ${Math.round(started * 100)}% idle and this refuses below `
        + `${Math.round(floor * 100)}%. A number taken now is about the machine, not the command.\n`
        + '  Wait, or pass --force (the citation will say it was forced), or --idle to lower the floor.');
    }

    const idles: number[] = [started];
    const on = new Date().toISOString().slice(0, 10);
    const taken = (): Parameters<typeof conditions>[0] => ({ idles, floor, busy, forced: force });

    /**
     * One run, with a reading taken after it.
     *
     * **Between runs, never during.** A sample taken while the command runs measures the command, which
     * for anything worth timing is the whole box — a quiet machine reads 0% idle and says nothing about
     * whether anything *else* was competing.
     */
    const measure = async (target: string): Promise<Trial & { readonly cores: number }> => {
      // The window is the spawn alone: `idleNow` below blocks for SAMPLE_MS of near-idle, and including it
      // would dilute the reading by that much of every run
      const before = cpuNow();
      const { code, output, ms, timedOut } = await boundedSpawn('sh', ['-c', target], BUDGET_MS);
      const cores = coresBusySince(before);
      idles.push(idleNow());
      return { ms, code, stderr: timedOut === true ? `${output}\ntimed out` : output, cores };
    };

    /** Timing mode throws on failure: a failed run has no duration worth reporting. */
    const time = async (target: string): Promise<{ readonly ms: number; readonly cores: number }> => {
      const { ms, code, cores } = await measure(target);
      if (code !== 0) throw new Error(`the command failed (exit ${code}): ${target}`);
      return { ms, cores };
    };

    if (trials !== undefined) {
      const results: Trial[] = [];
      // Trials mode tolerates a failure, because the failure is the measurement
      for (let i = 0; i < trials; i += 1) results.push(await measure(command));
      const failures = results.filter((trial) => trial.code !== 0).length;
      console.log(`\n  ${command}`);
      console.log(`  ${failures} of ${results.length} failed (${Math.round(rateOf(results) * 100)}%, at most `
        + `${Math.round(upperBound(failures, results.length) * 100)}% at 95% confidence), `
        + `${conditions(taken())}, ${on}`);
      // One group per distinct failure, with the text verbatim: the grouping is a convenience and the
      // exemplar is the evidence. Whether these are one bug or three is the reader's call, not this tool's
      for (const group of groupBySignature(results)) {
        console.log(`\n  ${group.count}x  ${group.signature.slice(0, 140)}`);
        for (const line of group.exemplar.split('\n').slice(-6)) console.log(`      ${line}`);
      }
      process.exitCode = failures > 0 ? 1 : 0;
      return;
    }

    const samples: Record<'a' | 'b', number[]> = { a: [], b: [] };
    const cores: Record<'a' | 'b', number[]> = { a: [], b: [] };
    for (const arm of runOrder(runs, against !== undefined)) {
      const run = await time(arm === 'a' ? command : against!);
      samples[arm].push(run.ms);
      cores[arm].push(run.cores);
    }

    /** The conditions are the series', not each arm's: both arms ran through the same window */
    const quote = (series: number[]): string => citation({ ...taken(), summary: summarise(series), on });

    console.log('');
    if (against === undefined) {
      console.log(`  ${command}\n  ${quote(samples.a)}`);
    } else {
      const delta = pairedDelta(samples.a, samples.b);
      // Cores busy per arm, on `--against` only: it is the signal that says the treatment reached the thing
      // being changed, and a null wall-clock delta cannot be read without it. `coresBusy` has the case
      const busyText = (series: number[]): string => `${summarise(series).median.toFixed(1)} cores busy`;
      console.log(`  A  ${command}\n     ${quote(samples.a)}\n     ${busyText(cores.a)}`);
      console.log(`  B  ${against}\n     ${quote(samples.b)}\n     ${busyText(cores.b)}`);
      // The paired difference, not the difference of the medians: pairing is why the arms interleave
      const sign = delta.ms >= 0 ? '+' : '';
      console.log(`\n  B - A: ${sign}${(delta.ms / 1000).toFixed(1)}s (${sign}${Math.round(delta.fraction * 100)}% of A), paired over ${runs}`);
    }
  } finally {
    // Whatever happened above, including a throw: the burners stop before this returns
    burners.abort();
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
