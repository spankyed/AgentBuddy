import { beforeEach, expect, it, vi } from 'vitest';

type Registration = {
  electronApp: [(args: unknown, use: unknown, worker: unknown) => Promise<void>, unknown];
};
const { extend, resolveHost, launch } = vi.hoisted(() => ({
  extend: vi.fn<(fixtures: Registration) => object>(() => ({})),
  resolveHost: vi.fn(() => { throw new Error('host is not built'); }),
  launch: vi.fn(),
}));
vi.mock('@playwright/test', async importOriginal => ({
  ...await importOriginal<typeof import('@playwright/test')>(),
  test: { extend }, _electron: { launch },
}));
vi.mock('../src/test-host.ts', () => ({ resolveTestHost: resolveHost }));
import { createTest, test as defaultTest } from '../src/index.ts';

beforeEach(() => { resolveHost.mockClear(); launch.mockClear(); });

it('registers default and explicit fixtures without resolving or launching an app', () => {
  expect(defaultTest).toBeDefined();
  expect(createTest({ appRoot: '/unbuilt-checkout' }).test).toBeDefined();
  expect(resolveHost).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
});

it('validates the host when the app fixture starts, before setup or launch', async () => {
  const use = vi.fn();
  const registration = extend.mock.calls[0][0];
  await expect(registration.electronApp[0]({}, use, {})).rejects.toThrow('host is not built');
  expect(resolveHost).toHaveBeenCalledOnce();
  expect(use).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
});
