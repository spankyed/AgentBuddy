import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
import { createEarsEngine } from '@apackdev/ears';
import { bindSettingsRequest } from '@apackdev/host/settings';
import type { Message } from '@apackdev/sdk/events';
import { rootEvents } from '../../src/transport/emitter.ts';
import { unbindHost } from '@apackdev/sdk/runtime/internals';
import { _settingsAdmin } from '@apackdev/sdk/services';
import type { EARS } from '@apackdev/sdk';

const fixture = vi.hoisted(() => ({ data: { app: { projects: 'invalid' } } as unknown }));
vi.mock('@apackdev/host/database', async importOriginal => ({
  ...await importOriginal<typeof import('@apackdev/host/database')>(),
  openDatabaseStore: ({ schema }: import('@apackdev/host/database').DatabaseStoreOptions) => {
    const engine = createEarsEngine({ isEntityType: name => schema.getRegisteredEntityTypes().has(name) });
    return { engine, store: {
      query: () => ({ getAttrCount: () => 1, getFirstAttr: () => fixture.data }),
      hydrate: async () => {
        engine.admin.bulkLoadAttr('Settings-app' as EARS.EntityId, 'data' as EARS.AttrKind, fixture.data, 0);
        engine.admin.bulkLoadAttr('Settings-app' as EARS.EntityId, 'entityType' as EARS.AttrKind, 'Settings', 0);
      },
    } };
  },
}));
vi.mock('@apackdev/host/packs/runtime', async importOriginal => ({
  ...await importOriginal<typeof import('@apackdev/host/packs/runtime')>(),
  loadAppPacks: vi.fn(() => ({ loaded: [] })),
  startPacks: vi.fn(),
}));
const { loadAppPacks, startPacks } = await import('@apackdev/host/packs/runtime');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-settings-recovery-'));
vi.stubEnv('APACK_ENV', 'test');
vi.stubEnv('APACK_USER_DATA_DIR', dataDir);
vi.stubEnv('SHIPPED_PACKS_DIR', '');
const backend = await import('../../src/runtime/index.ts');
afterAll(() => { backend.backendActor?.stop(); unbindHost(); fs.rmSync(dataDir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

it('boots host recovery before loading external modules, repairs, and starts normally only on a new boot', async () => {
  await backend.setupBackend();
  expect(loadAppPacks).not.toHaveBeenCalled();
  expect(startPacks).not.toHaveBeenCalled();
  expect(backend.appPacks.getRegisteredSystems().get('host/settings')).toBeDefined();
  expect(backend.appPacks.getRegisteredSystems().get('host/packs')).toBeUndefined();
  const settings = _settingsAdmin();
  const recovery = settings.getRecovery()!;
  expect(recovery.problems).toContainEqual({ target: { kind: 'app' }, path: ['projects'], message: 'must be array' });
  expect(() => settings.getSnapshot()).toThrow('projects');
  const outgoing: Message[] = [];
  const stop = rootEvents.onOutgoing(message => { outgoing.push(message); });
  rootEvents.emitConnected();
  const event = { type: 'RECOVER_SETTINGS' as const, request: { version: recovery.version, reset: [{ kind: 'app' as const }] } };
  const credential = backend.appSettingsAccess.issueHost('recovery-window');
  bindSettingsRequest(event, () => backend.appSettingsAccess.resolve('recovery-window', credential));
  rootEvents.emitIncoming({ to: 'host/settings', sender: 'host/settings', from: 'host', client: 'recovery-window', call: 'repair', event });
  await Promise.resolve();
  expect(outgoing).toContainEqual(expect.objectContaining({ answering: 'repair', event: expect.objectContaining({ type: 'SETTINGS_RECOVERED', recovery: expect.objectContaining({ status: 'repaired' }) }) }));
  // A new window gets the retained restart requirement rather than an apparently ready host-only app.
  rootEvents.emitIncoming({ to: 'host/settings', sender: 'host/settings', from: 'host', client: 'recovery-window', call: 'new-window', event: { type: 'GET_SETTINGS' } });
  await Promise.resolve();
  expect(outgoing).toContainEqual(expect.objectContaining({ answering: 'new-window', event: expect.objectContaining({ type: 'SETTINGS_RECOVERY', recovery: expect.objectContaining({ status: 'repaired', problems: [] }) }) }));
  stop();
  expect(settings.getRecovery()).toMatchObject({ status: 'repaired', problems: [] });
  expect(() => backend.appPacks.catalog.assertPackSettings({ id: 'candidate', name: 'Candidate', version: '1.0.0' })).toThrow('Restart the app');
  expect(loadAppPacks).not.toHaveBeenCalled();
  expect(startPacks).not.toHaveBeenCalled();
  fixture.data = settings.getOverrides();
  backend.backendActor.stop();
  unbindHost();
  await backend.setupBackend();
  expect(loadAppPacks).toHaveBeenCalledTimes(1);
  expect(startPacks).toHaveBeenCalledTimes(1);
  expect(_settingsAdmin().getRecovery()).toBeUndefined();
});
