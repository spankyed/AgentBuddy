import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { commitSystem } from '../../../../src/features/code/be/features/commit.ts';

const actors: Array<{ stop(): void }> = [];
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { actors.splice(0).forEach(actor => actor.stop()); vi.useRealTimers(); });
function start() {
  const status = vi.fn(), log = vi.fn();
  const actor = createActor(commitSystem.provide({ actions: { getGitStatus: status, logList: log } }),
    { input: { baseDirectory: null } }).start();
  actors.push(actor);
  return { actor, status, log };
}

it('coalesces repeated status changes into one status and history refresh', async () => {
  const { actor, status, log } = start();
  for (let i = 0; i < 3; i++) actor.send({ type: 'commit.GIT_STATUS_CHANGED' });
  await vi.advanceTimersByTimeAsync(149);
  expect(status).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(status).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledTimes(1);
});

it('cancels a pending refresh when the commit actor stops', async () => {
  const { actor, status, log } = start();
  actor.send({ type: 'commit.GIT_STATUS_CHANGED' });
  actor.stop();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(150);
  expect(status).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});
