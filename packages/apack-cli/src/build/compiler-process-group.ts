import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

export const COMPILER_PROCESS_GROUP_ENV = 'APACK_COMPILER_PROCESS_GROUP';

const execute = promisify(execFile);
// SIGKILL has no graceful shutdown phase; bound OS scheduling/state checks before refusing publication.
const SHUTDOWN_MS = 2_000;

/** Stop only the POSIX group created for this compiler worker and its inherited subprocesses. */
export async function stopCompilerProcessGroup(pid: number): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Compiler process group requires a positive worker PID');
  let signalError: unknown;
  const kill = () => {
    signalError = undefined;
    try { process.kill(-pid, 'SIGKILL'); return true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
      // Signal failure alone cannot distinguish live tasks from a terminal group; confirm state below.
      signalError = error;
      return true;
    }
  };
  if (!kill()) return;
  const deadline = performance.now() + SHUTDOWN_MS;
  for (;;) {
    // Orphaned zombies cannot execute or write output, and some container init processes don't reap them.
    const remaining = Math.ceil(deadline - performance.now());
    if (remaining <= 0) {
      if (signalError) throw new Error(`Could not stop live compiler process group ${pid}: ${String(signalError)}`, { cause: signalError });
      throw new Error(`Compiler process group ${pid} did not stop; refusing publication`);
    }
    const { stdout } = await execute('/bin/ps', ['-axo', 'pgid=,stat='], { timeout: remaining });
    const running = stdout.trim().split('\n').some(line => {
      const [group, state] = line.trim().split(/\s+/);
      return Number(group) === pid && state && !state.startsWith('Z');
    });
    if (!running) return;
    // A denied signal can race natural shutdown; require terminal state within the same fixed budget.
    if (!kill()) return;
    await delay(10);
  }
}
