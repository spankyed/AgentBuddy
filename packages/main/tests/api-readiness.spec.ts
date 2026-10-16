import { afterEach, expect, it, vi } from 'vitest';
import { ApiServer } from '../src/modules/api-server/ApiServer.ts';
import { API_CONFIG } from '../src/modules/api-server/config.ts';
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: { isPackaged: false } }));
vi.mock('../src/modules/api-server/config.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/modules/api-server/config.ts')>(),
  getApiPaths: () => ({ apiPath: '/fixture-api' }),
}));
vi.mock('../src/modules/api-server/logger.ts', () => ({
  logInfo: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), getLogger: vi.fn(), logStartupBanner: vi.fn(),
}));
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture() {
  vi.useFakeTimers();
  const server = new ApiServer();
  const launch = server as unknown as {
    startApiServer(): Promise<void>;
    cleanupOrphanedApiChildren(path: string): Promise<void>;
    launchApiServer(path: string): Promise<void>;
    handleProcessExit(code: number, signal: null): void;
    handleServerReady(port: number): void;
  };
  vi.spyOn(launch, 'cleanupOrphanedApiChildren').mockResolvedValue(undefined);
  vi.spyOn(launch, 'launchApiServer').mockResolvedValue(undefined);
  return { server, launch };
}
it('settles an existing window readiness wait after a failed first launch retries', async () => {
  const { server, launch } = fixture();
  await launch.startApiServer();
  let ready = false;
  void server.waitForReady(10000).then(() => { ready = true; });
  launch.handleProcessExit(1, null);
  await vi.advanceTimersByTimeAsync(API_CONFIG.RESTART_DELAY);
  expect(launch.launchApiServer).toHaveBeenCalledTimes(2);
  launch.handleServerReady(61244);
  await Promise.resolve(); await Promise.resolve();
  expect(ready).toBe(true);
});
it('waits for replacement readiness when a previously ready API exits', async () => {
  const { server, launch } = fixture();
  await launch.startApiServer();
  launch.handleServerReady(61237);
  await server.waitForReady(10000);
  launch.handleProcessExit(1, null);
  let ready = false;
  void server.waitForReady(10000).then(() => { ready = true; });
  await Promise.resolve(); await Promise.resolve();
  expect(ready).toBe(false);
  await vi.advanceTimersByTimeAsync(API_CONFIG.RESTART_DELAY);
  launch.handleServerReady(61244);
  await Promise.resolve(); await Promise.resolve();
  expect(ready).toBe(true);
});
