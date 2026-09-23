// The lock a tool holds while it changes a data dir's database (`abuddy db`), so an app that starts meanwhile
// refuses to open the same database instead of overwriting the change from its own memory. A check alone can't do
// that: the app could start in the moment between the check and the write.
//
// The mechanism is `../exclusive-lock.ts`, shared with the CLI's code generation. What is this module's own is the
// policy: where the file lives, what the refusal says, and that the app asserts on it before opening a store.
import * as path from 'node:path';
import { findLockHolder, holdExclusiveLock, INTERRUPTS } from '../exclusive-lock.ts';

export { INTERRUPTS };

const lockFile = (userDataDir: string) => path.join(userDataDir, 'db-write.lock');

/**
 * What a tool is changing in this data dir's database right now, or `null` when nothing is: a lock whose process has
 * exited doesn't count. Two cases can't be resolved and count as held: a lock this version can't read, and one
 * naming another machine, whose pid means nothing here.
 */
export function findDatabaseWriter(userDataDir: string): string | null {
  return findLockHolder(lockFile(userDataDir));
}

/** Where the lock is, and that removing it is the way out when no tool is really running */
const clearHint = (userDataDir: string) =>
  `If no tool is running, delete ${lockFile(userDataDir)} and try again.`;

/** A lock a tool holds; `release()` is safe to call more than once */
export interface DatabaseWriteLock {
  release(): void;
}

/**
 * Takes the lock for `userDataDir` while a tool changes its database. Throws when another tool holds it; a lock left
 * by a process that has exited is taken over. The caller releases it, whatever happens.
 */
export function holdDatabaseWriteLock(userDataDir: string, what: string): DatabaseWriteLock {
  return holdExclusiveLock({
    file: lockFile(userDataDir),
    what,
    refuse: (holder) => new Error(`Another tool is changing the database in ${userDataDir}: ${holder}. ${clearHint(userDataDir)}`),
  });
}

/**
 * Throws when a tool holds the lock for `userDataDir`: the app refuses to open a database another process is in the
 * middle of changing, rather than starting on data that is about to change under it.
 */
export function assertNoDatabaseWriter(userDataDir: string): void {
  const held = findDatabaseWriter(userDataDir);
  if (held) {
    throw new Error(
      `The database in ${userDataDir} is being changed by ${held}. Wait for it to finish, then start AgentBuddy again. `
      + clearHint(userDataDir),
    );
  }
}
