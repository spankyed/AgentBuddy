// The window's client, over tRPC and Electron's API status: a backend that gave up before this window started
// listening is reported as main recorded it, message and stack apart, so the error page can lay them out.
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/core/trpc', () => ({
  trpc: { bus: { sub: { subscribe: () => ({ unsubscribe: () => {} }) } } },
  reconnectApiClient: () => false,
}));
vi.mock('@/core/toast', () => ({ globalToast: { error: vi.fn() } }));

const { feClient } = await import('@/core/fe-client');

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
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
