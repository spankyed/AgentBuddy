// The host `application` system keeps the app shell's state: which plugins' tabs the user showed or hid, and
// the plugin last open. It stores them in AppState, and tells the application plugin the visibility again whenever
// a choice or a pack's defaults change, so every window agrees.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createActor, type EventFromLogic } from 'xstate';
import type { Message } from '@abuddy/sdk/events';
import { resetTestData, testRootEvents } from '@abuddy/sdk/testing';
import '../../packs/runtime/test-host.ts';
import { appState } from '../../../src/app-state/index.ts';
import { createApplicationSystem } from '../../../src/features/application/be/system.ts';

/** A registry whose features declare `defaults` as their tabs' visibility */
const withDefaults = (visibility: Record<string, boolean>, pluginIds: string[] = []) => ({
  settingsDefaults: () => ({ revision: 1, settings: { plugins: {} }, visibility }),
  pluginIds: () => pluginIds as never,
  builtInPacks: () => [],
});

let stop: (() => void) | undefined;

/** The application system, and what it sends to plugins */
function runApplicationSystem(defaults: Record<string, boolean> = {}, pluginIds: string[] = []) {
  const sent: Message[] = [];
  const stopListening = testRootEvents.onPluginSend((message) => void sent.push(message));
  const machine = createApplicationSystem(withDefaults(defaults, pluginIds));
  const actor = createActor(machine).start();
  stop = () => {
    actor.stop();
    stopListening();
  };
  const visibilitySent = () => sent.filter((message) => message.event.type === 'PLUGIN_VISIBILITY_UPDATED');
  return { send: (event: EventFromLogic<typeof machine>) => actor.send(event), visibilitySent };
}

beforeEach(() => resetTestData());
afterEach(() => stop?.());

describe('the host application system', () => {
  it('records a tab shown or hidden, and sends the visibility, defaults included, to the application plugin', () => {
    const system = runApplicationSystem({ 'default-setup/logs': false, 'default-setup/notes': true });

    system.send({ type: 'SET_PLUGIN_VISIBILITY', plugin: 'default-setup/notes', visible: false });

    expect(appState.get().pluginVisibility).toEqual({ 'default-setup/notes': false });
    expect(system.visibilitySent()).toEqual([{
      to: 'host/application',
      event: { type: 'PLUGIN_VISIBILITY_UPDATED', pluginVisibility: { 'default-setup/logs': false, 'default-setup/notes': false } },
    }]);
  });

  it('records the plugin last open', () => {
    const system = runApplicationSystem();

    system.send({ type: 'SET_LAST_ACTIVE_PLUGIN', plugin: 'default-setup/threads' });

    expect(appState.get().lastActivePlugin).toBe('default-setup/threads');
  });

  // A bare id names no plugin, so nothing could ever read the choice back
  it('ignores a plugin id that is not a ref', () => {
    const system = runApplicationSystem();

    system.send({ type: 'SET_PLUGIN_VISIBILITY', plugin: 'notes', visible: false });
    system.send({ type: 'SET_LAST_ACTIVE_PLUGIN', plugin: 'threads' });

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
