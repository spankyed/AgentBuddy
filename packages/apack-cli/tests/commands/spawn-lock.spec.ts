// Two questions arriving at once start one app.
//
// This is the case Phase 5's Done-when asked for and the plan's files table specified — `--spawn` under
// `holdExclusiveLock` with the re-read after acquiring — and the failure without it is not a wasted
// process but a corrupt record: both spawn, the second Electron is refused the data dir by the
// single-instance lock, and its `dev` can still see the *first* app's port file appear and publish a
// session carrying its own pid and the other app's port. A reclaim then signals a supervisor holding
// nothing while the real app survives with its session gone.
//
// **It is asked in one process**, because `holdExclusiveLock` has no re-entrancy: a second take in this
// process is refused exactly as another process's would be, which is the condition under test. The spawner
// is injected, so what a case reads is whether a spawn happened rather than two Electrons.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdExclusiveLock } from '@apack/host/exclusive-lock';
import { publishSession, readSession, type DevSession } from '@apack/host/dev-session';
import { spawnOrAttach } from '../../src/app/drive-attach';

let dataDir: string;
let spawns: number;

/** A spawner that publishes a session as a real `dev` would, and counts its calls. */
const spawner = async (_from: string, dir: string) => {
  spawns += 1;
  publishSession({ debugPort: 51873, dataDir: dir, supervisorPid: process.pid, startedBy: 'drive' });
  return { session: readSession(dir)! };
};

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-spawn-lock-'));
  spawns = 0;
});
afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('two questions spawning at once', () => {
  it('starts one app, and the loser attaches to it', async () => {
    // The winner holds the lock and has not published yet — the state in which a loser without the lock
    // would spawn a second app. What the loser does *instead* is the claim, so the waiter is injected
    // rather than ordered by a sleep: `spec-waits` refuses a spec that sleeps and then asserts, and the
    // version that dropped the sleep passed while no longer firing on the mutation that removes the lock.
    const lock = holdExclusiveLock({ file: path.join(dataDir, 'spawn.lock'), what: 'the other question', refuse: () => new Error('held') });
    const winner: DevSession = { debugPort: 44444, dataDir, supervisorPid: process.ppid, startedBy: 'drive' };
    const waitFor = vi.fn(async () => winner);

    const loser = await spawnOrAttach('/pack', dataDir, [], { spawn: spawner, waitFor }).finally(() => lock.release());

    // One app: the loser waited for the winner's rather than starting a second
    expect(spawns).toBe(0);
    expect(waitFor).toHaveBeenCalledWith(dataDir);
    expect(loser.state).toBe('attached');
    expect(loser.app.session.supervisorPid).toBe(process.ppid);
    expect(loser.app.session.debugPort).toBe(44444);
  });

  /**
   * The re-read after acquiring, which is the other half: by the time a loser has the lock the winner has
   * usually already published and released, and attaching is what the caller wanted. Without it this
   * spawns a second app over a data dir that already has one.
   */
  it('attaches to a session published while it waited for the lock', async () => {
    publishSession({ debugPort: 44444, dataDir, supervisorPid: process.pid, startedBy: 'drive' });

    const answer = await spawnOrAttach('/pack', dataDir, [], { spawn: spawner });

    expect(spawns).toBe(0);
    expect(answer.state).toBe('attached');
    expect(answer.app.session.debugPort).toBe(44444);
  });

  it('spawns when it holds the lock and there is nothing to attach to', async () => {
    const answer = await spawnOrAttach('/pack', dataDir, [], { spawn: spawner });

    expect(spawns).toBe(1);
    expect(answer.state).toBe('spawned');
  });

  /** The lock is released whichever way it went, or the next question here waits out its whole deadline. */
  it('leaves the lock free afterwards, and after a failed spawn', async () => {
    await spawnOrAttach('/pack', dataDir, [], { spawn: spawner });
    fs.rmSync(path.join(dataDir, 'session.json'));
    await expect(spawnOrAttach('/pack', dataDir, [], { spawn: async () => { throw new Error('build failed'); } }))
      .rejects.toThrow(/build failed/);

    const after = await spawnOrAttach('/pack', dataDir, [], { spawn: spawner });

    expect(after.state).toBe('spawned');
  });
});
