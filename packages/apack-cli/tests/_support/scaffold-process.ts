import { spawn } from 'node:child_process';
import { stopCompilerProcessGroup } from '../../src/build/compiler-process-group.ts';

/** Keep the real authoring toolchain off Vitest's event loop, including its awaited shutdown. */
export async function runScaffoldCommand(command: string, args: string[], cwd: string,
  { signal, timeout = 60_000 }: { signal?: AbortSignal; timeout?: number } = {},
): Promise<{ code: number; output: string }> {
  signal?.throwIfAborted();
  const started = performance.now();
  const label = [command, ...args].join(' ');
  const grouped = process.platform !== 'win32';
  const child = spawn(command, args, {
    cwd, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' },
  });
  let output = '';
  let failure: Error | undefined;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  let shutdown: ReturnType<typeof setTimeout> | undefined;
  let budget: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  let forced: Promise<void> | undefined;
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  try {
    const code = await new Promise<number>((resolve, reject) => {
      const stop = (reason: Error) => {
        if (failure) return;
        failure = reason;
        // Public builds drain their compiler owners on SIGTERM; escalate only after that grace period.
        child.kill('SIGTERM');
        escalation = setTimeout(() => {
          forced = grouped && child.pid ? stopCompilerProcessGroup(child.pid)
            : Promise.resolve().then(() => { child.kill('SIGKILL'); });
          void forced.catch(reject);
        }, 2_000);
        shutdown = setTimeout(() => reject(new Error(`${label}: process did not close within the 20s cleanup limit`, { cause: reason })), 20_000);
      };
      abort = () => stop(new Error(`${label}: cancelled`, { cause: signal?.reason }));
      budget = setTimeout(() => stop(new Error(`${label}: operation exceeded ${timeout}ms\n${output}`)), timeout);
      signal?.addEventListener('abort', abort, { once: true });
      child.once('error', error => { failure ??= error; });
      child.once('close', code => {
        clearTimeout(budget);
        if (abort) signal?.removeEventListener('abort', abort);
        resolve(code ?? 1);
      });
      if (signal?.aborted) abort();
    });
    clearTimeout(escalation);
    await forced;
    // The compiler has its own process owner; this group covers direct toolchain descendants.
    if (grouped && child.pid) await stopCompilerProcessGroup(child.pid);
    if (failure) throw failure;
    return { code, output };
  } finally {
    clearTimeout(budget);
    clearTimeout(escalation);
    clearTimeout(shutdown);
    if (abort) signal?.removeEventListener('abort', abort);
    console.info(`[scaffold] ${label}: ${Math.round(performance.now() - started)}ms`);
  }
}
