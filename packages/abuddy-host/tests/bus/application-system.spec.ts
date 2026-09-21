// The host `application` system keeps the app shell's state: which plugins' tabs the user showed or hid, and
// the plugin last open. It stores them in AppState, and tells the application plugin the visibility again whenever
// a choice or a pack's defaults change, so every window agrees.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createActor, setup, type AnyEventObject } from 'xstate';
import { bus } from '@abuddy/sdk/ids';
import { resetTestData } from '@abuddy/sdk/testing';
import '../packs/runtime/test-host.ts';
import { appState } from '../../src/app-state/index.ts';
import { application, createApplicationSystem } from '../../src/bus/application-system.ts';

/** A registry whose features declare `defaults` as their tabs' visibility */
const withDefaults = (visibility: Record<string, boolean>) => ({
  settingsDefaults: () => ({ revision: 1, settings: { plugins: {} }, visibility }),
});

let stop: (() => void) | undefined;

/** The application system next to a bus that records what it is sent */
function runApplicationSystem(defaults: Record<string, boolean> = {}) {
  const sent: AnyEventObject[] = [];
  const busStub = setup({ types: {} as { events: AnyEventObject } }).createMachine({
    on: { '*': { actions: ({ event }) => void sent.push(event) } },
  });
  const root = setup({ actors: { bus: busStub, application: createApplicationSystem(withDefaults(defaults)) } }).createMachine({
    invoke: [{ src: 'bus', systemId: bus }, { src: 'application', systemId: application }],
  });
  const actor = createActor(root).start();
  stop = () => actor.stop();
  const visibilitySent = () => sent.flatMap((e) => (e.type === 'OUTGOING' && e.message.event.type === 'PLUGIN_VISIBILITY_UPDATED' ? [e.message] : []));
  return { send: (event: AnyEventObject) => actor.system.get(application).send(event), visibilitySent };
}

beforeEach(() => resetTestData());
afterEach(() => stop?.());

describe('the host application system', () => {
  it('records a tab shown or hidden, and sends the visibility, defaults included, to the application plugin', () => {
    const system = runApplicationSystem({ 'default-setup/logs': false, 'default-setup/notes': true });

    system.send({ type: 'SET_PLUGIN_VISIBILITY', pluginId: 'default-setup/notes', visible: false });

    expect(appState.get().pluginVisibility).toEqual({ 'default-setup/notes': false });
    expect(system.visibilitySent()).toEqual([{
      to: 'host/application',
      event: { type: 'PLUGIN_VISIBILITY_UPDATED', pluginVisibility: { 'default-setup/logs': false, 'default-setup/notes': false } },
    }]);
  });

  it('records the plugin last open', () => {
    const system = runApplicationSystem();

    system.send({ type: 'SET_LAST_ACTIVE_PLUGIN', pluginId: 'default-setup/threads' });

    expect(appState.get().lastActivePlugin).toBe('default-setup/threads');
  });

  // A bare id names no plugin, so nothing could ever read the choice back
  it('ignores a plugin id that is not a ref', () => {
    const system = runApplicationSystem();

    system.send({ type: 'SET_PLUGIN_VISIBILITY', pluginId: 'notes', visible: false });
    system.send({ type: 'SET_LAST_ACTIVE_PLUGIN', pluginId: 'threads' });

    expect(appState.get()).toMatchObject({ pluginVisibility: {} });
    expect(appState.get().lastActivePlugin).toBeUndefined();
    expect(system.visibilitySent()).toEqual([]);
  });

  it("sends the visibility again when a pack comes or goes, since it brings or takes its features' defaults", () => {
    const system = runApplicationSystem({ 'memo-pack/memos': false });

    system.send({ type: 'PACK_CHANGED', packId: 'memo-pack' });

    expect(system.visibilitySent()).toEqual([{ to: 'host/application', event: expect.objectContaining({ pluginVisibility: { 'memo-pack/memos': false } }) }]);
  });
});
