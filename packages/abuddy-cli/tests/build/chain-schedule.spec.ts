// The chain's scheduler, against a fake runner. A scheduler fails in ways a passing timing run cannot show:
// it can leak a lane, keep dispatching after a failure, run an exclusive step beside another, or simply
// never return. Each of those is a case here, and none of them is visible from a green `npm run chain`.
import { describe, expect, it } from 'vitest';
import { criticalPath, schedule, type SchedulableStep } from '../../../../scripts/lib/chain-schedule.ts';

const step = (name: string, needs: string[] = [], extra: Partial<SchedulableStep> = {}): SchedulableStep =>
  ({ name, needs, ...extra });

/** A runner that records concurrency and finishes a step when told, so ordering is asserted rather than timed */
function runner(failing: string[] = []) {
  const release = new Map<string, () => void>();
  const order: string[] = [];
  let live = 0;
  let peak = 0;
  const run = (s: SchedulableStep): Promise<boolean> => {
    order.push(s.name);
    live += 1;
    peak = Math.max(peak, live);
    return new Promise<boolean>((resolve) => release.set(s.name, () => { live -= 1; resolve(!failing.includes(s.name)); }));
  };
  /** Lets every step that has started and not finished complete, repeatedly, until the run settles */
  const drain = async (): Promise<void> => {
    for (let i = 0; i < 50 && release.size > 0; i += 1) {
      for (const [name, done] of [...release]) { release.delete(name); done(); }
      await new Promise((r) => setImmediate(r));
    }
  };
  return { run, drain, order, peak: () => peak, live: () => live };
}

const never = (): boolean => false;

describe('schedule', () => {
  it('runs one at a time in dependency order at one lane', async () => {
    const r = runner();
    const steps = [step('a'), step('b', ['a']), step('c', ['b'])];
    const done = schedule({ steps, lanes: 1, skip: never, run: r.run });
    await r.drain();
    await done;
    expect(r.order).toEqual(['a', 'b', 'c']);
    expect(r.peak()).toBe(1);
  });

  it('runs independent steps together, up to the lane limit', async () => {
    const r = runner();
    const steps = [step('a'), step('b'), step('c'), step('d')];
    const done = schedule({ steps, lanes: 2, skip: never, run: r.run });
    await r.drain();
    await done;
    expect(r.peak()).toBe(2);
    expect(r.order.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never runs an exclusive step beside another', async () => {
    const r = runner();
    // The exclusive step is ready at the same moment as two others
    const steps = [step('lock', [], { exclusive: true }), step('a'), step('b')];
    const done = schedule({ steps, lanes: 3, skip: never, run: r.run });
    await r.drain();
    await done;
    expect(r.order[0]).toBe('lock');
    expect(r.peak()).toBe(2); // lock alone, then a and b together
  });

  it('holds an exclusive step until the lanes are free', async () => {
    const r = runner();
    const steps = [step('a'), step('b'), step('lock', [], { exclusive: true })];
    const done = schedule({ steps, lanes: 2, skip: never, run: r.run });
    await r.drain();
    await done;
    expect(r.order).toEqual(['a', 'b', 'lock']);
    expect(r.peak()).toBe(2);
  });

  // `ready` depends on nothing, so it is dispatchable the moment a lane frees up. That is what makes this a
  // test of the failure guard: a step that merely *needed* the failed one would never be ready anyway, and
  // such a test passes with the guard deleted — measured.
  it('stops dispatching a ready step once something has failed', async () => {
    const r = runner(['a']);
    const steps = [step('a'), step('ready')];
    const done = schedule({ steps, lanes: 1, skip: never, run: r.run });
    await r.drain();
    const outcome = await done;
    expect(outcome.failed).toBe('a');
    expect(r.order).toEqual(['a']);
  });

  it('never runs a step whose dependency failed', async () => {
    const r = runner(['a']);
    const steps = [step('a'), step('needs-a', ['a'])];
    const done = schedule({ steps, lanes: 2, skip: never, run: r.run });
    await r.drain();
    await done;
    expect(r.order).toEqual(['a']);
  });

  it('awaits the steps already running when one fails, leaving nothing in flight', async () => {
    const r = runner(['a']);
    const steps = [step('a'), step('b'), step('c', ['b'])];
    const done = schedule({ steps, lanes: 2, skip: never, run: r.run });
    await r.drain();
    await done;
    expect(r.live()).toBe(0);
  });

  it('returns rather than hanging when the rest of the graph is unreachable', async () => {
    const r = runner(['a']);
    const steps = [step('a'), step('b', ['a']), step('c', ['b'])];
    const done = schedule({ steps, lanes: 1, skip: never, run: r.run });
    await r.drain();
    // The assertion is that this resolves at all: a scheduler that waits on `waiting` emptying would hang
    await expect(done).resolves.toMatchObject({ failed: 'a' });
  });

  it('costs a skipped step no lane, and unblocks what needed it', async () => {
    const r = runner();
    const steps = [step('a'), step('b', ['a']), step('c', ['b'])];
    const done = schedule({ steps, lanes: 1, skip: (s) => s.name !== 'c', run: r.run });
    await r.drain();
    const outcome = await done;
    expect(outcome.skipped).toEqual(['a', 'b']);
    expect(r.order).toEqual(['c']);
  });
});

describe('criticalPath', () => {
  it('is the longest path by seconds, not the longest by step count', () => {
    const steps = [
      step('a', [], { seconds: 1 }),
      step('short', ['a'], { seconds: 50 }),
      step('one', ['a'], { seconds: 2 }),
      step('two', ['one'], { seconds: 2 }),
      step('three', ['two'], { seconds: 2 }),
    ];
    expect(criticalPath(steps)).toEqual({ names: ['a', 'short'], seconds: 51 });
  });

  it('ignores a need that is not in the set, so a cached step costs nothing', () => {
    // `b` needs `a`, but only `b` ran — the answer is b alone, not a crash
    expect(criticalPath([step('b', ['a'], { seconds: 4 })])).toEqual({ names: ['b'], seconds: 4 });
  });

  it('counts a step with no measurement as free rather than dropping the path', () => {
    expect(criticalPath([step('a', [], {}), step('b', ['a'], { seconds: 3 })])).toEqual({ names: ['a', 'b'], seconds: 3 });
  });
});
