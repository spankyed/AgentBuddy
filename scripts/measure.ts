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
import {
  asNumber, citation, driftedDuring, groupBySignature, idleNow, IDLE_FLOOR, pairedDelta, parseFlags,
  rateOf, refusesAsBusy, runOrder, startBurners, summarise, upperBound, type Trial,
} from './lib/measure.ts';
import { boundedSpawn } from './lib/bounded-spawn.ts';

const USAGE = 'usage: npm run measure -- [--runs N | --trials N [--stop-on-failure]] [--idle PERCENT] '
  + '[--timeout MINUTES] [--busy N] [--force] [--against "<command B>"] "<command>"';

/**
 * A bound, because a run that can hang cannot fail — the rule `bounded-spawn` exists for.
 *
 * Wide enough that nothing measured here has come near it, and a timed-out trial is a failure with its own
 * signature rather than a series that never ends.
 */
const DEFAULT_TIMEOUT_MINUTES = 30;

async function main(): Promise<void> {
  const parsed = parseFlags(process.argv.slice(2), {
    values: ['runs', 'idle', 'against', 'trials', 'busy', 'timeout'],
    booleans: ['force', 'stop-on-failure'],
  });
  const runs = asNumber(parsed.values.runs, 'runs') ?? 5;
  const trials = asNumber(parsed.values.trials, 'trials');
  const busy = asNumber(parsed.values.busy, 'busy') ?? 0;
  const percent = asNumber(parsed.values.idle, 'idle');
  const floor = percent === undefined ? IDLE_FLOOR : percent / 100;
  const minutes = asNumber(parsed.values.timeout, 'timeout') ?? DEFAULT_TIMEOUT_MINUTES;
  const against = parsed.values.against;
  const stopOnFailure = parsed.flags.has('stop-on-failure');
  // `--busy` deliberately does what the rest of this refuses, so it carries its own permission. The
  // citation says the run was under induced load, and the idle reading below is the load it actually
  // achieved rather than the one it asked for
  const force = parsed.flags.has('force') || busy > 0;

  if (parsed.positionals.length !== 1 || runs < 1 || busy < 0 || minutes <= 0
    || (trials !== undefined && trials < 1)) {
    throw new Error(USAGE);
  }
  // Two questions, and an A/B of failure *rates* is a third nobody has asked for yet
  if (trials !== undefined && against !== undefined) {
    throw new Error('--trials asks how often a command fails and --against compares two durations; pick one.');
  }
  const command = parsed.positionals[0]!;
  const budgetMs = minutes * 60_000;

  const burners = new AbortController();
  startBurners(busy, burners.signal, budgetMs);
  try {
    const started = idleNow();
    if (refusesAsBusy({ idle: started, floor, force })) {
      throw new Error(`The machine is ${Math.round(started * 100)}% idle and this refuses below `
        + `${Math.round(floor * 100)}%. A number taken now is about the machine, not the command.\n`
        + '  Wait, or pass --force (the citation will say it was forced), or --idle to lower the floor.');
    }

    const idles: number[] = [started];

    /**
     * One run, with a reading taken after it.
     *
     * **Between runs, never during.** A sample taken while the command runs measures the command, which
     * for anything worth timing is the whole box — a quiet machine reads 0% idle and the number says
     * nothing about whether anything *else* was competing. Between runs there is only the other load,
     * which is the question. A single run therefore has no during-series reading at all, and the honest
     * thing is to say the number was taken before it started rather than to invent one.
     *
     * It captures output even in timing mode, where the output is thrown away: measured 2026-09-30,
     * capture against a discarding pipe was 49ms vs 50ms over 1MB and 265ms vs 336ms over 20MB, so there
     * is nothing to save, and a mode of its own would be a second stdio answer earning nothing.
     */
    const measure = async (target: string): Promise<Trial> => {
      const { code, output, ms, timedOut } = await boundedSpawn('sh', ['-c', target], budgetMs);
      idles.push(idleNow());
      return { ms, code, stderr: timedOut === true ? `${output}\ntimed out after ${minutes} minutes` : output };
    };

    /** Timing mode throws on failure: a failed run has no duration worth reporting. */
    const time = async (target: string): Promise<number> => {
      const { ms, code } = await measure(target);
      if (code !== 0) throw new Error(`the command failed (exit ${code}): ${target}`);
      return ms;
    };

    const on = new Date().toISOString().slice(0, 10);

    if (trials !== undefined) {
      const taken: Trial[] = [];
      for (let i = 0; i < trials; i += 1) {
        // Trials mode tolerates a failure, because the failure is the measurement
        taken.push(await measure(command));
        if (stopOnFailure && taken.at(-1)!.code !== 0) break;
      }
      const failures = taken.filter((trial) => trial.code !== 0).length;
      console.log(`\n  ${command}`);
      console.log(`  ${failures} of ${taken.length} failed (${Math.round(rateOf(taken) * 100)}%, at most `
        + `${Math.round(upperBound(failures, taken.length) * 100)}% at 95% confidence), `
        + `${Math.round(Math.min(...idles) * 100)}% idle, ${on}`
        + `${driftedDuring(idles, floor) ? ' — conditions drifted mid-series' : ''}`);
      // One group per distinct failure, with the text verbatim: the grouping is a convenience and the
      // exemplar is the evidence. Whether these are one bug or three is the reader's call, not this tool's
      for (const group of groupBySignature(taken)) {
        console.log(`\n  ${group.count}x  ${group.signature.slice(0, 140)}`);
        for (const line of group.exemplar.split('\n').slice(-6)) console.log(`      ${line}`);
      }
      process.exitCode = failures > 0 ? 1 : 0;
      return;
    }

    const samples: Record<'a' | 'b', number[]> = { a: [], b: [] };
    for (const arm of runOrder(runs, against !== undefined)) {
      samples[arm].push(await time(arm === 'a' ? command : against!));
    }

    const drifted = driftedDuring(idles, floor);
    const worst = Math.min(...idles);

    /** The conditions are the series', not each arm's: both arms ran through the same window */
    const quote = (series: number[]): string =>
      `${citation({ summary: summarise(series), idle: worst, on, forced: force, drifted })}`
      + `${busy > 0 ? ` — under ${busy} induced busy cores` : ''}`;

    console.log('');
    if (against === undefined) {
      console.log(`  ${command}`);
      console.log(`  ${quote(samples.a)}`);
    } else {
      const delta = pairedDelta(samples.a, samples.b);
      console.log(`  A  ${command}`);
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
  } finally {
    // Whatever happened above, including a throw: the burners stop before this returns
    burners.abort();
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
