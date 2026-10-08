// One writer or long reader of a pack's `dist` at a time, and the policy over `@abuddy/host/exclusive-lock`'s
// mechanism: where the lock file lives, what the refusal says, and how long a second arrival waits.
//
// **It guards the output, not only the build**, which is why `abuddy pack` takes it too: staging an archive is
// a multi-file copy of `dist`, and a build renaming that tree mid-copy gives an archive holding half of two
// builds. That is a wider window than the rename itself and a worse outcome, since the archive looks whole.
//
// **Two builds of one pack corrupt each other.** They stage into the same directory (`buildStagingDir`) and
// each clears it before it starts, so the second wipes the first's half-written tree and both then rename
// something over `dist`. Writing straight into `dist` was no better — it was two writers of one tree — but
// sharing a staging directory makes the collision certain rather than likely.
//
// **And nothing else excluded them.** `holdChainLock` keeps one chain run per checkout, and `withBuildLock`
// (`@abuddy/host/build/packages-built`) keeps one build of the five `@abuddy` packages; a pack's own build sat
// between the two with no lock, so `npm run compile` run beside a chain, or two agents in one checkout, raced.
// What that costs is not only a broken `dist`: a reader of the pack's `dist/build` while one build has moved it
// aside sees no build dir at all, which is how a dependent's seed compiler comes back unresolved.
//
// **It waits rather than refusing**, which is the opposite of the chain's choice and for the opposite reason.
// Two chain runs are a mistake to be told about — they would cache each other's results. Two builds are just
// work: serialised they are both correct, the second simply builds the sources as they are when it starts. So
// the default is to queue, and the bound is for a holder that is wedged rather than working.
import * as path from 'node:path';
import { findLockHolder, holdExclusiveLockWaiting, type ExclusiveLock } from '@abuddy/host/exclusive-lock';

/**
 * The lock, inside the pack.
 *
 * `.abuddy/` because every pack already ignores it — a lock file `git` reports is a file that appears and
 * vanishes inside the population this repo's own checks derive from. **Not under `.abuddy/build/`**, which is
 * the staging directory a build clears as its first act: a lock there would be removed by the holder's own
 * build, and the next arrival would take it while that build was still running.
 */
export const packBuildLock = (packRoot: string): string => path.join(packRoot, '.abuddy', 'build.lock');

/**
 * How long a second build waits before refusing: a bound, not a schedule — it returns the moment the holder is
 * gone. Five minutes against a full build of ~24s on the largest pack here, the ratio `waitForPackageBuild` and
 * `CHAIN_WAIT_MS` both chose: several times what the waited-for thing costs, so a wedged holder is reported
 * rather than waited on for ever.
 */
export const PACK_BUILD_WAIT_MS = 300_000;

/** Thrown when another build of this pack holds the lock and the wait ran out */
export class PackBuildLockHeld extends Error {
  constructor(readonly holder: string, packId: string, file: string) {
    const where = path.relative(process.cwd(), file);
    super(`another build of ${packId} holds ${where}:\n  ${holder}\n\n`
      + 'Two builds of one pack stage into the same directory and each clears it first, so they would\n'
      + 'overwrite each other and leave `dist` as half of either.\n'
      + `If no build is running, delete ${where} and try again.`);
  }
}

/**
 * Takes the pack's build lock, waiting for a running build and then refusing.
 *
 * `what` is what the holder was doing, for the message the next arrival reads. A build in *this* process is
 * refused at once rather than waited for, which `holdExclusiveLockWaiting` does: nothing nests today, and
 * waiting for yourself spends the bound to say what a refusal says immediately.
 */
export function holdPackBuildLock(
  packRoot: string,
  { packId, what, waitMs = PACK_BUILD_WAIT_MS, onWait, now, pause }: {
    packId: string;
    what: string;
    waitMs?: number;
    onWait?: (holder: string) => void;
    /**
     * Injected by the spec, as `holdChainLock`'s are: a case that waits on real time is a case whose duration
     * is a guess, and it fails on a busy machine for reasons that have nothing to do with locking.
     */
    now?: () => number;
    pause?: (ms: number) => Promise<void>;
  },
): Promise<ExclusiveLock> {
  const file = packBuildLock(packRoot);
  return holdExclusiveLockWaiting({
    file,
    what,
    waitMs,
    refuse: (holder) => new PackBuildLockHeld(holder, packId, file),
    ...(onWait && { onWait }),
    ...(now && { now }),
    ...(pause && { pause }),
  });
}

/**
 * Waits for a build of `packRoot` to finish, without taking the lock. `undefined` when none was running.
 *
 * **For a reader of *another* pack's output, where holding is the wrong instrument.** A dependent's build
 * already holds its own lock while it resolves dependencies, so taking the dependency's too would hold two at
 * once — and two locks acquired in an order neither caller controls is a deadlock waiting for a dependency
 * cycle. Waiting holds nothing, so it cannot deadlock.
 *
 * What it buys is the common case: a build in flight when the read starts is waited out, rather than the read
 * seeing a tree mid-rename and taking absent for *not built* — which is how a dependency's seed compiler comes
 * back unresolved. What it does **not** cover is a build that starts *during* the read; closing that needs the
 * dependent's own lock released before it resolves, so only one is ever held, and that is a change to the
 * order of `build()` rather than to this.
 */
export async function waitForPackBuild(
  packRoot: string,
  { timeoutMs = PACK_BUILD_WAIT_MS, onWait, pause = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); }), now = Date.now }: {
    timeoutMs?: number;
    onWait?: (holder: string) => void;
    pause?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<string | undefined> {
  const file = packBuildLock(packRoot);
  const waitedFor = findLockHolder(file);
  if (!waitedFor) return undefined;
  onWait?.(waitedFor);
  const deadline = now() + timeoutMs;
  // A bound, not a schedule: it returns the moment the holder is gone. A holder that outlasts it leaves the
  // caller to read as it would have anyway, which is the behaviour without this rather than a hang.
  while (findLockHolder(file) && now() < deadline) await pause(POLL_MS);
  return waitedFor;
}

/** How often a waiter looks again. Nothing is taken, so this is only how long it sleeps between reads */
const POLL_MS = 250;
