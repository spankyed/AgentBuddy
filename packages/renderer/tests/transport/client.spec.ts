// The window's client, over tRPC and Electron's API status: a backend that gave up before this window started
// listening is reported as main recorded it, message and stack apart, so the error page can lay them out.
import { afterEach, expect, it, vi } from 'vitest';

const mutate = vi.fn<(message: unknown) => Promise<void>>();
vi.mock('@/transport', () => ({
  trpc: { bus: { sub: { subscribe: () => ({ unsubscribe: () => {} }) }, send: { mutate: (m: unknown) => mutate(m) } } },
  reconnectApiClient: () => false,
}));
vi.mock('@/adapters/toast', () => ({ globalToast: { error: vi.fn() } }));

const { feClient } = await import('@/transport/client');
const { globalToast } = await import('@/adapters/toast');

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  vi.mocked(globalToast.error).mockClear();
  mutate.mockReset();
});

/**
 * **A send that fails tells the user; an answer that fails does not.**
 *
 * This is the same call `5ab702222` made for a send that stays inside the window, in the one path that leaves
 * it. A command someone gave is worth a toast — they are still there, and they can act on it. An answer has
 * nobody behind it: a plugin asked, the answering side replied, and if the asking system no longer declares the
 * event the person gets a sentence about plumbing they did not cause. `Message.answering` is set by `reply` and
 * by nothing else, which is what makes it safe to branch on here.
 *
 * The log is unconditional in both: whoever can act on it is reading the Logs plugin, not a toast.
 */
it('toasts a send that fails, because someone asked for it', async () => {
  mutate.mockRejectedValue(new Error('Unknown event "NOPE" for system "pack/feature"'));

  feClient.send({ to: 'pack/feature', event: { type: 'NOPE' } });
  await vi.waitFor(() => expect(globalToast.error).toHaveBeenCalled());

  expect(vi.mocked(globalToast.error).mock.calls[0]?.[0]).toContain("Couldn't send NOPE to pack/feature");
});

// Remove the `answering` guard in client.ts and this is the case that fails
it('does not toast an answer that fails, but still logs it', async () => {
  const write = vi.fn((_entry: { level: string; source: string; message: string }) => Promise.resolve());
  (window as unknown as { electronAPI: unknown }).electronAPI = { rendererLog: { write } };
  mutate.mockRejectedValue(new Error('Unknown event "ANSWER" for system "pack/asker"'));

  feClient.send({ to: 'pack/asker', event: { type: 'ANSWER' }, answering: true });
  await vi.waitFor(() => expect(write).toHaveBeenCalled());

  expect(globalToast.error, 'nobody is waiting on an answer to be told').not.toHaveBeenCalled();
  expect(write.mock.calls[0]?.[0], 'and the diagnostic still reaches the log').toMatchObject({
    source: 'fe-client',
    level: 'error',
  });
});

it('reports a backend that already gave up with the error main recorded, not its string', async () => {
  const error = { message: 'Max restart attempts reached', stack: 'Error: Max restart attempts reached\n    at ApiServer' };
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    apiStatus: {
      getStatus: () => Promise.resolve({ running: false, error, restartAttempts: 3 }),
      onEvent: () => () => {},
    },
  };
  const onFailed = vi.fn();

  const stop = feClient.subscribe({ onConnected: () => {}, onDisconnected: () => {}, onMessage: () => {}, onFailed });
  await vi.waitFor(() => expect(onFailed).toHaveBeenCalled());
  stop();

  expect(onFailed).toHaveBeenCalledWith(error);
});

it('reports an API process that stopped, message and stack apart', async () => {
  let report: ((event: { type: string; error?: unknown }) => void) | undefined;
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    apiStatus: {
      getStatus: () => Promise.resolve({ running: true, restartAttempts: 0 }),
      onEvent: (callback: typeof report) => { report = callback; return () => {}; },
    },
  };
  const onFailed = vi.fn();

  const stop = feClient.subscribe({ onConnected: () => {}, onDisconnected: () => {}, onMessage: () => {}, onFailed });
  report!({ type: 'api:stopped', error: { message: 'Backend process exited unexpectedly (code 1)', stack: 'at api' } });
  stop();

  expect(onFailed).toHaveBeenCalledWith({ message: 'Backend process exited unexpectedly (code 1)', stack: 'at api' });
});
