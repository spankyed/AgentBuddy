/**
 * Runs a command under a wall-clock budget: `tsx scripts/bounded.ts <seconds> <command> [args...]`.
 *
 * For the npm scripts that invoke a shell script directly. The chain kills a step's process group when it
 * overruns, so a script run *through the chain* is already bounded — but the direct run is the one people
 * and agents actually use, and it had no bound at all. `tests/scripts/test-packaged-authoring.sh` is the
 * worked example: it looks bounded, with `set timeout 120` in its expect block, and is not. That timeout
 * covers a pattern match and not the `wait` that follows, which is how it once hung a machine until three
 * pids were killed by hand.
 *
 * The budget is seconds, written at the call site so it is visible next to what it bounds. Size it at about
 * four times what the thing costs healthy — `scripts/lib/chain-steps.ts` carries those measurements — so
 * that normal variance never trips it and a wedged run is still reported in a bounded time. A budget nobody
 * would wait for is the same as no budget.
 */
import { boundedSpawn } from './lib/bounded-spawn.ts';

const [seconds, command, ...args] = process.argv.slice(2);
const budgetMs = Number(seconds) * 1000;

if (!command || !Number.isFinite(budgetMs) || budgetMs <= 0) {
  process.stderr.write('usage: tsx scripts/bounded.ts <seconds> <command> [args...]\n');
  process.exitCode = 2;
} else {
  const { code, ms, timedOut } = await boundedSpawn(command, args, budgetMs, { stream: true });
  if (timedOut) {
    // Its own line on stderr: the command's own output ended mid-sentence, so say why
    process.stderr.write(`\nTIMEOUT after ${(ms / 1000).toFixed(0)}s: ${command} ${args.join(' ')}\n`
      + `Its budget is ${seconds}s and its process group was killed. Either it is wedged, or it has grown `
      + `and the budget at the call site is stale.\n`);
  }
  // Not process.exit(): it would drop whatever the child's inherited stdio has still to flush
  process.exitCode = code;
}
