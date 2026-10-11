// Which unattended app closes itself, and when.
//
// **Both halves need a firing case, and they fail to opposite mutations.** Reaping on `startedBy` alone
// closes the development app a developer is working in; reaping on the profile alone closes the app they
// opened themselves with `apack dev --profile`. So the two clauses are asserted apart, and the deadline
// arithmetic is asserted as the claim it makes — that a session asked a question wakes this once per
// question and an idle one wakes it once.
import { describe, expect, it } from 'vitest';
import { IDLE_REAP_MS, idleVerdict, reapsWhenIdle } from '../../src/commands/dev';

const drive = { startedBy: 'drive' } as const;
const person = { startedBy: 'dev' } as const;

describe('which app closes itself when nothing attaches', () => {
  it('is a drive app in a profile, which nothing else reclaims', () => {
    expect(reapsWhenIdle(drive, { build: 'development', profile: '/p/probe' })).toBe(true);
  });

  /**
   * The development dir is `mayReclaim`'s, not this timer's: the developer's own `apack dev` or
   * `npm start` takes it back and says so. Mutation — drop the `profile` clause — and this is the case
   * that fails, where a `--spawn` with no flags lands exactly here.
   */
  it('is not a drive app in the development dir', () => {
    expect(reapsWhenIdle(drive, { build: 'development' })).toBe(false);
  });

  /**
   * A person's app is never a tool's to close, in a profile as much as anywhere. Mutation — drop the
   * `startedBy` clause — and this is the case that fails.
   */
  it('is not an app a person started, wherever it is', () => {
    expect(reapsWhenIdle(person, { build: 'development', profile: '/p/mine' })).toBe(false);
    expect(reapsWhenIdle(person, { build: 'development' })).toBe(false);
  });

  it('is never a build that has no debug port to attach to', () => {
    // `debugPortArgs` publishes no session for these, so no supervisor arms the timer — but the rule must
    // not be the one place that would say yes if one ever did
    expect(reapsWhenIdle(drive, { build: 'beta', profile: '/p/probe' })).toBe(true);
    expect(reapsWhenIdle(person, { build: 'beta', profile: '/p/probe' })).toBe(false);
  });
});

describe('when it decides', () => {
  const now = 1_000_000;

  it('closes the app once the window has passed', () => {
    expect(idleVerdict(now - IDLE_REAP_MS, now, IDLE_REAP_MS)).toEqual({ reap: true, againInMs: 0 });
    expect(idleVerdict(now - IDLE_REAP_MS - 60_000, now, IDLE_REAP_MS)).toEqual({ reap: true, againInMs: 0 });
  });

  /**
   * The next wakeup is the deadline re-derived, not an interval: a question asked a minute ago moves it a
   * minute out, so nothing between now and then can change the answer. That is what makes this a waiter
   * rather than a poll, and `againInMs` being `idleMs` — a fixed interval — is the mutation it fails on.
   */
  it('asks again exactly when the answer could change', () => {
    expect(idleVerdict(now - 60_000, now, IDLE_REAP_MS)).toEqual({ reap: false, againInMs: IDLE_REAP_MS - 60_000 });
    expect(idleVerdict(now, now, IDLE_REAP_MS)).toEqual({ reap: false, againInMs: IDLE_REAP_MS });
  });

  /** A clock that went backwards between the touch and the read is "just attached", never a reap. */
  it('does not close an app whose record is in the future', () => {
    expect(idleVerdict(now + 5_000, now, IDLE_REAP_MS).reap).toBe(false);
  });
});
