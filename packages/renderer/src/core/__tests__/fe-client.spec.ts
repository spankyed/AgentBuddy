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
