import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiServer } from '../src/modules/api-server/ApiServer.ts';
import { ProcessManager } from '../src/modules/api-server/process-manager.ts';
import { logError } from '../src/modules/api-server/logger.ts';

vi.mock('../src/modules/api-server/logger.ts', () => ({
  logInfo: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), getLogger: vi.fn(), logStartupBanner: vi.fn(),
}));

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

function application() {
  const events = new EventEmitter();
  const attempts: { preventDefault: ReturnType<typeof vi.fn> }[] = [];
  const app = Object.assign(events, {
    isPackaged: false,
    whenReady: () => new Promise<void>(() => {}),
    quit: vi.fn(() => {
      const event = { preventDefault: vi.fn() };
      attempts.push(event);
      events.emit('before-quit', event);
    }),
  });
  new ApiServer().enable({ app: app as unknown as Electron.App });
  return { app, attempts };
}

it('defers quit until API exit and lets the resumed quit proceed', async () => {
  let exited!: () => void;
  const stop = vi.spyOn(ProcessManager.prototype, 'stop').mockReturnValue(new Promise(resolve => { exited = resolve; }));
  const { app, attempts } = application();
  app.quit();
  app.quit();
  expect(attempts.every(event => event.preventDefault.mock.calls.length === 1)).toBe(true);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(app.quit).toHaveBeenCalledTimes(2);
  exited();
  await vi.waitFor(() => expect(app.quit).toHaveBeenCalledTimes(3));
  expect(attempts[2]!.preventDefault).not.toHaveBeenCalled();
  expect(stop).toHaveBeenCalledTimes(1);
});

it('keeps quit cancelled on shutdown failure and allows a fresh attempt', async () => {
  const stop = vi.spyOn(ProcessManager.prototype, 'stop').mockRejectedValueOnce(new Error('API still alive'))
    .mockResolvedValue(undefined);
  const { app, attempts } = application();
  app.quit();
  await vi.waitFor(() => expect(logError).toHaveBeenCalledWith('[MAIN] API shutdown failed:', expect.any(Error)));
  expect(app.quit).toHaveBeenCalledTimes(1);
  expect(attempts[0]!.preventDefault).toHaveBeenCalledOnce();
  app.quit();
  await vi.waitFor(() => expect(app.quit).toHaveBeenCalledTimes(3));
  expect(stop).toHaveBeenCalledTimes(2);
  expect(attempts[2]!.preventDefault).not.toHaveBeenCalled();
});
