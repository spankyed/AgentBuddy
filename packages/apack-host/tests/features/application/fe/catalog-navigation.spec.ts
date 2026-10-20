import { afterEach, expect, it, vi } from 'vitest';
import { createActor, createMachine, type Actor } from 'xstate';
import { resolveName } from '@apackdev/sdk/ids';
import type { NativePackDeclaration } from '@apackdev/sdk/framework';
import { createFePackRegistry } from '../../../../src/fe/pack-store.ts';
import { createShellMachine, type ShellMachine } from '../../../../src/features/application/fe/machine.ts';
import type { PluginCatalogEntry } from '../../../../src/packs/catalog.ts';
import { fakeShell } from './fakes.ts';

let app: Actor<ShellMachine> | undefined;
afterEach(() => { app?.stop(); app = undefined; });

function fixture() {
  const packs = createFePackRegistry();
  const native: NativePackDeclaration = { id: 'host', features: { settings: { description: 'Host settings.',
    plugin: { label: 'Settings', state: 'native/state.ts', canvas: 'native/settings.vue' } } } };
  packs.registerPackFE({ kind: 'native', declaration: native }, { id: 'host', features: {
    settings: { plugin: { label: 'Settings', state: createMachine({}), canvas: {} } },
  } });
  const shell = fakeShell({ plugins: packs.getRegisteredPlugins() });
  const entries: PluginCatalogEntry[] = [{ featureRef: resolveName('settings', 'host'), packId: 'host', origin: 'native', enabled: true,
    declaration: native.features!.settings!.plugin! }];
  const listeners = new Set<() => void>();
  const catalog = { status: vi.fn<() => 'loading' | 'ready' | 'disconnected'>(() => 'ready'), plugins: () => entries,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  app = createActor(createShellMachine({ ...shell.options, packs, catalog }), {
    systemId: 'host/application', input: {},
  }).start();
  const publish = () => { for (const listener of listeners) listener(); };
  const candidate = (id: string, isDefault = false, enabled = true) => {
    const declaration = { label: id, state: 'src/state.ts', canvas: 'src/view.vue', ...(isDefault && { default: true as const }) };
    const manifest = { id, name: id, version: '1.0.0', features: { view: { description: 'External view.', plugin: declaration } } };
    const pack = { id, name: id, version: '1.0.0', manifest, declarationRevision: `declaration-${id}`, registrationId: `runtime-${id}`, buildRevision: 'a'.repeat(64) };
    const entry: PluginCatalogEntry = { featureRef: resolveName('view', id), packId: id, declaration, origin: 'installed', enabled,
      declarationRevision: pack.declarationRevision, buildRevision: pack.buildRevision };
    const registration = { id, declarationRevision: pack.declarationRevision, features: { view: {
      plugin: { label: id, state: createMachine({}), canvas: {} }, ...(isDefault && { default: true as const }),
    } } };
    return { entry, pack, registration, declare() { entries.push(entry); publish(); },
      accept() { const plugins = packs.registerPackFE({ kind: 'loaded', pack }, registration);
        app!.send({ type: 'PACK_FRONTEND_LOADED', packId: id, registrationId: pack.registrationId, plugins }); return plugins; } };
  };
  return { packs, shell, entries, catalog, listeners, candidate, publish };
}

it('chooses the declared default independently of frontend delivery order, retaining host settings while it loads', () => {
  const f = fixture(); const first = f.candidate('alpha', true); const second = f.candidate('zeta', true);
  first.declare(); second.declare(); second.accept();
  expect(app!.getSnapshot().context.activePlugin.id).toBe('host/settings');
  expect(app!.getSnapshot().context.defaultPlugin).toBeNull();
  first.accept();
  expect(app!.getSnapshot().context.activePlugin.id).toBe('alpha/view');
  expect(app!.getSnapshot().context.defaultPlugin?.id).toBe('alpha/view');
  app!.stop(); expect(f.listeners.size).toBe(0);
});

it('preserves saved selection and explicit navigation over a later default', () => {
  const f = fixture(); const preferred = f.candidate('preferred'); const defaultView = f.candidate('default', true);
  preferred.declare(); defaultView.declare();
  f.shell.client.receive({ to: 'host/application', event: { type: 'CLIENT_CONNECTED', pluginVisibility: {}, lastActivePlugin: 'preferred/view' } });
  defaultView.accept(); expect(app!.getSnapshot().context.activePlugin.id).toBe('host/settings');
  preferred.accept(); expect(app!.getSnapshot().context.activePlugin.id).toBe('preferred/view');
  app!.send({ type: 'SELECT_PLUGIN', plugin: 'host/settings' });
  f.publish(); expect(app!.getSnapshot().context.activePlugin.id).toBe('host/settings');
});

it('distinguishes unknown, disabled and failed destinations, without waiting for unrelated frontend imports', () => {
  const f = fixture(); const disabled = f.candidate('disabled', false, false); disabled.declare();
  app!.send({ type: 'OPEN_PLUGIN', plugin: 'unknown/view', events: [] });
  expect(app!.getSnapshot().context.awaitingPlugin).toEqual([]);
  expect(f.shell.notify.error).toHaveBeenLastCalledWith("Couldn't open unknown/view", 'No plugin is declared at "unknown/view".');
  app!.send({ type: 'OPEN_PLUGIN', plugin: 'disabled/view', events: [] });
  expect(f.shell.notify.error).toHaveBeenLastCalledWith("Couldn't open disabled/view", 'The pack providing "disabled/view" is disabled.');
  const failed = f.candidate('failed'); failed.declare();
  app!.send({ type: 'OPEN_PLUGIN', plugin: 'failed/view', events: [] });
  expect(app!.getSnapshot().context.awaitingPlugin).toHaveLength(1);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try { app!.send({ type: 'PACK_FRONTENDS_SETTLED', failedPacks: [{ packId: 'failed', error: 'Import failed' }] }); }
  finally { warn.mockRestore(); }
  expect(f.shell.notify.error).toHaveBeenCalledWith("Couldn't open failed/view", 'The plugin "failed/view" could not be loaded.');
  expect(app!.getSnapshot().context.awaitingPlugin).toEqual([]);
});

it('reconciles admission before the catalog frame and rejects a stale completion without replacing the current actor', () => {
  const f = fixture(); const next = f.candidate('external', true);
  f.catalog.status.mockReturnValue('loading'); const plugins = next.accept();
  expect(app!.system.get('external/view')).toBeUndefined();
  f.entries.push(next.entry); f.catalog.status.mockReturnValue('ready'); f.publish();
  const actor = app!.system.get('external/view'); expect(actor).toBeDefined();
  expect(app!.getSnapshot().context.activePlugin.id).toBe('external/view');
  app!.send({ type: 'PACK_FRONTEND_LOADED', packId: 'external', registrationId: 'retired', plugins });
  expect(app!.system.get('external/view')).toBe(actor);
  expect(app!.getSnapshot().context.acceptedPackRuntimes.external).toBe(next.pack.registrationId);
  f.catalog.status.mockReturnValue('disconnected'); f.publish();
  app!.send({ type: 'SELECT_PLUGIN', plugin: 'host/settings' });
  expect(app!.getSnapshot().context.activePlugin.id).toBe('host/settings');
  app!.send({ type: 'OPEN_PLUGIN', plugin: 'external/view', events: [] });
  expect(app!.getSnapshot().context.activePlugin.id).toBe('host/settings');
});

it('does not route new requests to an actor while its replacement binding awaits shell admission', () => {
  const f = fixture(); const next = f.candidate('external'); next.declare(); next.accept();
  const old = app!.system.get('external/view')!; const sent = vi.spyOn(old, 'send');
  f.packs.replacePackFE({ kind: 'loaded', pack: { ...next.pack, registrationId: 'replacement' } }, next.registration);
  app!.send({ type: 'SELECT_PLUGIN', plugin: 'external/view' });
  expect(app!.getSnapshot().context.activePlugin.id).toBe('host/settings');
  app!.send({ type: 'SEND_TO_PLUGIN', plugin: 'external/view', events: [{ type: 'DO_WORK' }] });
  expect(sent).not.toHaveBeenCalled();
  expect(app!.getSnapshot().context.awaitingPlugin).toHaveLength(1);
});

it('steps the switch-plugin hotkeys over a declared tab whose frontend has not loaded', () => {
  const f = fixture(); const alpha = f.candidate('alpha'); const beta = f.candidate('beta'); const gamma = f.candidate('gamma');
  alpha.declare(); beta.declare(); gamma.declare();
  alpha.accept(); gamma.accept();
  app!.send({ type: 'SELECT_PLUGIN', plugin: 'alpha/view' });
  app!.send({ type: 'SWITCH_PLUGIN_DOWN' });
  expect(app!.getSnapshot().context.activePlugin.id).toBe('gamma/view');
  app!.send({ type: 'SWITCH_PLUGIN_UP' });
  expect(app!.getSnapshot().context.activePlugin.id).toBe('alpha/view');
});
