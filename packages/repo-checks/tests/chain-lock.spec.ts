/**
 * One chain run per checkout.
 *
 * What is this module's own, and all these cases are about: where the lock file sits, what the refusal says,
 * and the `--wait` retry. The mechanism underneath — `wx` as the acquisition, taking over a lock whose holder
 * exited, counting an unreadable or foreign-machine lock as held, releasing on four interrupts — is
 * `@abuddy/host/exclusive-lock`'s, and `abuddy-host/tests/database/write-lock.spec.ts` covers it from above
 * with real processes. Re-testing it here would duplicate a 4-second suite to assert someone else's contract.
 *
 * **No case takes `CHAIN_LOCK` itself.** This spec runs inside `test:integration`, which the chain runs, so a
 * case taking the real lock would be refused by the run that is running it. Behaviour goes through a temp
 * file; the real path is checked as a *property* instead, which is where the one trap lives.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CHAIN_LOCK, CHAIN_WAIT_MS, ChainLockHeld, chainInvocation, holdChainLock } from '../../../scripts/lib/chain-lock.ts';
import { STAMP_DIR } from '../../../scripts/lib/chain-stamps.ts';
import { CHAIN_FLAGS } from '../../../scripts/lib/chain-flags.ts';

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-lock-'));
  file = path.join(dir, 'chain.lock');
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

/** A lock another process holds: this machine's name, a pid that is running, and not ours */
const heldByAnother = (what: string): void => {
  // `process.ppid` is alive and is not this process, so `lockIsHeld` says held and `release` won't remove it
  fs.writeFileSync(file, JSON.stringify({ pid: process.ppid, machine: os.hostname(), what, since: new Date().toISOString() }));
};

describe('where the chain lock lives', () => {
  /**
   * The trap, and the reason the file is not called `chain.lock.json`. `pruneStamps` in `scripts/chain.ts`
   * walks the stamp directory and removes every `.json` that is not a live step's stamp — so a lock named
   * that way is deleted by the *next* run while this one is still holding it, and both then run.
   *
   * Asserted against `pruneStamps`' own predicate rather than against the string `'chain.lock'`: a case
   * pinning the name passes while the coupling it stands for rots.
   */
  it('is in the stamp directory, under a name pruneStamps will not delete', () => {
    expect(path.dirname(CHAIN_LOCK)).toBe(STAMP_DIR);
    const prunes = (name: string) => name.endsWith('.json');
    expect(prunes(path.basename(CHAIN_LOCK)), `${path.basename(CHAIN_LOCK)} would be pruned`).toBe(false);
    // The predicate is the live one, not a lookalike: it is what prunes a stamp
    expect(prunes(path.basename(path.join(STAMP_DIR, 'typecheck.json')))).toBe(true);
  });

  it('names the chain and its flags, so the next arrival knows what it is behind', () => {
    expect(chainInvocation([])).toBe('npm run chain');
    expect(chainInvocation(['--all', '--record'])).toBe('npm run chain --all --record');
  });

  // The flag is declared, which is what makes `--wait` reach the parser rather than being refused as a typo
  it('is opted into waiting by a declared flag', () => {
    expect(CHAIN_FLAGS.booleans).toContain('wait');
  });
});

describe('a second run', () => {
  it('is refused, and told who holds it and how to get past it', async () => {
    heldByAnother('npm run chain --all --record');

    const refused = await holdChainLock({ what: 'npm run chain', file }).catch((err: unknown) => err);

    expect(refused).toBeInstanceOf(ChainLockHeld);
    const { message } = refused as ChainLockHeld;
    expect(message, 'the holder, so you know what you are behind').toContain('npm run chain --all --record');
    expect(message, "the holder's pid, so you can check it is really there").toContain(`pid ${process.ppid}`);
    expect(message, 'why it matters, not just that it happened').toContain('cache results the other took');
    expect(message, 'the way to queue').toContain('--wait');
    expect(message, 'the way to run both at once').toContain('git worktree add');
    expect(message, 'the way out of a lock nothing holds').toMatch(/delete .*chain\.lock/);
  });

  it('takes the lock when nothing holds it, and releases it', async () => {
    const lock = await holdChainLock({ what: 'npm run chain', file });
    expect(fs.existsSync(file)).toBe(true);

    lock.release();

    expect(fs.existsSync(file)).toBe(false);
  });

  // Another holder's lock is not ours to remove: releasing must not clear the file we never took
  it('leaves the holder\'s lock alone when it is refused', async () => {
    heldByAnother('npm run chain');

    await expect(holdChainLock({ what: 'npm run chain', file })).rejects.toThrow(ChainLockHeld);

    expect(fs.existsSync(file), "the holder's lock survived the refusal").toBe(true);
  });
});

/**
 * `--wait` queues instead of refusing. Both cases drive the retry through injected `pause`/`now` rather than
 * waiting a poll interval: a scheduling test that sleeps on real time fails on a busy machine for reasons
 * that have nothing to do with scheduling, and `bareWaits` refuses one in a spec besides.
 */
describe('--wait', () => {
  it('retries until the holder releases, then runs', async () => {
    heldByAnother('npm run chain');
    let waits = 0;
    let told: string | undefined;

    const lock = await holdChainLock({
      what: 'npm run chain -- --wait',
      waitMs: CHAIN_WAIT_MS,
      file,
      onWait: (holder) => { told = holder; },
      // The holder goes on the third look, and nothing here sleeps
      pause: async () => { if (++waits === 3) fs.rmSync(file); },
    });

    expect(waits, 'it kept trying rather than giving up on the first refusal').toBe(3);
    expect(told, 'said what it was waiting for once, so a wait never reads as a hang').toContain('npm run chain');
    expect(fs.existsSync(file)).toBe(true);
    lock.release();
  });

  it('gives up at the bound rather than waiting on a wedged holder forever', async () => {
    heldByAnother('npm run chain');
    let waits = 0;
    // A clock that reaches the bound on the second look, so the bound is what ends this and not a timer
    let clock = 0;
    const now = () => clock;

    const refused = await holdChainLock({
      what: 'npm run chain -- --wait',
      waitMs: CHAIN_WAIT_MS,
      file,
      now,
      pause: async () => { waits++; clock += CHAIN_WAIT_MS; },
    }).catch((err: unknown) => err);

    expect(refused).toBeInstanceOf(ChainLockHeld);
    expect(waits, 'it waited before giving up').toBe(1);
    expect((refused as ChainLockHeld).message, 'and says the holder is still there, not to wait for it')
      .toContain('It is still running.');
  });
});
