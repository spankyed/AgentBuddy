// One chain run per checkout, and the policy over `@abuddy/host/exclusive-lock`'s mechanism: where the lock
// file lives, what the refusal says, and how long `--wait` waits.
//
// **Two runs share this checkout's stamps**, `node_modules/.cache/abuddy-chain`, so each would cache results
// the other took against a different tree — and a step marked `cached` would mean "some run with these inputs
// passed" rather than "this tree passed". Nothing noticed before: the freshness sweep reports a step whose
// inputs moved mid-run as a step that will not be cached next time, which is a caching note over a
// correctness fact, and only after both runs have already spent the time.
//
// It is a module of its own because `chain.ts` runs the chain on import (a top-level `await main()`), so a
// spec can only reach this by it being here — the same reason `chain-stamps.ts` and `chain-flags.ts` exist.
import * as path from 'node:path';
import { holdExclusiveLock, type ExclusiveLock } from '@abuddy/host/exclusive-lock';
import { STAMP_DIR } from './chain-stamps.ts';

/**
 * The lock, beside the stamps it protects.
 *
 * **Not `.json`, and that is load-bearing.** `pruneStamps` in `chain.ts` walks this directory and removes
 * every `.json` file that is not a live step's stamp, so a lock named that way would be deleted by the next
 * run while this one still held it. `packages-build.lock` sits in its own stamp dir under the same rule.
 */
export const CHAIN_LOCK = path.join(STAMP_DIR, 'chain.lock');

/**
 * How long `--wait` waits before refusing anyway: a bound, not a schedule — it returns the moment the holder
 * is gone. Ten minutes against a cold chain's ~180s, the ratio `waitForPackageBuild` chose for the same
 * reason: several times what the waited-for thing costs, so a wedged holder is reported rather than waited on
 * forever, and a bound nobody will wait for is the same as no bound.
 */
export const CHAIN_WAIT_MS = 600_000;

/** How often a waiting run tries again. The take is the test, so this is only how long a loser sleeps */
const POLL_MS = 500;

/** Thrown when another run holds the lock: a refusal, which is why `chain.ts` prints it rather than rethrowing */
export class ChainLockHeld extends Error {
  constructor(readonly holder: string, waited: boolean, file: string = CHAIN_LOCK) {
    const where = path.relative(process.cwd(), file);
    super(`another chain run holds ${where}:\n  ${holder}\n\n`
      + 'Two runs share this checkout\'s stamps, so each would cache results the other took against a\n'
      + `different tree. ${waited ? 'It is still running.' : 'Wait for it to finish, or pass --wait to queue behind it.'}\n`
      + 'If you need both at once, give one of them its own checkout: `git worktree add`.\n'
      + `If no chain is running, delete ${where} and try again.`);
  }
}

/** What the holder was doing, for the message the next arrival reads: its own command, flags and all */
export const chainInvocation = (argv: readonly string[] = process.argv.slice(2)): string =>
  ['npm run chain', ...argv].join(' ');

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Takes the chain lock, or throws `ChainLockHeld`. With `waitMs`, a held lock is waited for and retried
 * until the bound, `onWait` told once what is being waited for — a wait that prints nothing reads as a hang.
 *
 * **The retry is around the take, never a check and then a take.** `holdExclusiveLock` refuses on `EEXIST`,
 * so the create is the test: two waiters arriving together cannot both win, and a loser simply waits again.
 * Asking `findLockHolder` first and taking afterwards is the shape that lets every racer read "nothing holds
 * it" — which is the bug `exclusive-lock.ts`'s header was written against.
 */
export async function holdChainLock(
  { what, waitMs = 0, onWait, file = CHAIN_LOCK, now = Date.now, pause = sleep }: {
    what: string;
    waitMs?: number;
    onWait?: (holder: string) => void;
    /**
     * Which lock, defaulting to the one the chain takes — as `withBuildLock` and `runningPackageBuild` take
     * theirs. The spec passes its own: this one's spec runs *inside* the chain (`repo-checks`), so a case
     * taking `CHAIN_LOCK` would be refused by the run that is running it.
     */
    file?: string;
    /** Injected by the spec, so the bound is reached without waiting out a real one */
    now?: () => number;
    pause?: (ms: number) => Promise<void>;
  },
): Promise<ExclusiveLock> {
  const deadline = now() + waitMs;
  let told = false;
  for (;;) {
    try {
      return holdExclusiveLock({
        file,
        what,
        refuse: (holder) => new ChainLockHeld(holder, told, file),
      });
    } catch (err) {
      if (!(err instanceof ChainLockHeld) || now() >= deadline) throw err;
      if (!told) {
        told = true;
        onWait?.(err.holder);
      }
      await pause(POLL_MS);
    }
  }
}
