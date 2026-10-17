/** Public commands drain owned build work before restoring the process's signal exit. */
export async function withBuildSignals(run: (signal: AbortSignal) => Promise<void>, onInterrupted?: () => void): Promise<void> {
  const controller = new AbortController();
  let received: 'SIGINT' | 'SIGTERM' | undefined;
  const stop = (signal: 'SIGINT' | 'SIGTERM') => { received ??= signal; controller.abort(); };
  const interrupt = () => stop('SIGINT');
  const terminate = () => stop('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    await run(controller.signal);
  } catch (error) {
    if (!received || !(error instanceof Error) || error.name !== 'AbortError') throw error;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
  if (received) {
    onInterrupted?.();
    process.kill(process.pid, received);
    await new Promise<never>(() => {});
  }
}
