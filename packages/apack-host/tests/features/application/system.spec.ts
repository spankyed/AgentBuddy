// The host `application` system keeps the app shell's state: which surfaces' tabs the user showed or hid, and
// the surface last open. It stores them in AppState, and tells the application surface the visibility again whenever
// a choice or a pack's defaults change, so every window agrees.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createActor, type EventFromLogic } from 'xstate';
import type { Message } from '@apackdev/sdk/events';
import { resetTestData, testRootEvents } from '@apackdev/sdk/testing';
import '../../packs/runtime/test-host.ts';
import { registry } from '../../packs/runtime/test-host.ts';
import { appState } from '../../../src/app-state/index.ts';
import { createApplicationSystem } from '../../../src/features/application/be/system.ts';

/** A registry whose features declare `defaults` as their tabs' visibility */
const COMMANDS = [{ name: 'standup', placeholder: 'Topic' }];

const withDefaults = (visibility: Record<string, boolean>, surfaceIds: string[] = []) => ({
  surfaceDefaults: () => visibility,
  surfaceIds: () => surfaceIds,
  loadedPacks: () => [],
  getPackRuntime: () => null,
  // The registry's, resolved from the `commands` designation; this system only passes it on
  commands: () => COMMANDS,
});

let stop: (() => void) | undefined;

/** The application system, and what it sends to surfaces */
function runApplicationSystem(defaults: Record<string, boolean> = {}, surfaceIds: string[] = []) {
  const sent: Message[] = [];
  const stopListening = testRootEvents.onSurfaceSend((message) => void sent.push(message));
  const machine = createApplicationSystem(withDefaults(defaults, surfaceIds));
  const actor = createActor(machine).start();
  stop = () => {
    actor.stop();
    stopListening();
  };
  const visibilitySent = () => sent.filter((message) => message.event.type === 'SURFACE_VISIBILITY_UPDATED');
  const commandsSent = () => sent.filter((message) => message.event.type === 'COMMANDS_UPDATED');
  return { send: (event: EventFromLogic<typeof machine>) => actor.send(event), visibilitySent, commandsSent };
}

beforeEach(() => resetTestData());
afterEach(() => stop?.());

describe('the host application system', () => {
  it('records a tab shown or hidden, and sends the visibility, defaults included, to the application surface', () => {
    const system = runApplicationSystem({ 'default-setup/logs': false, 'default-setup/notes': true });

    system.send({ type: 'SET_SURFACE_VISIBILITY', surface: 'default-setup/notes', visible: false });

    expect(appState.get().surfaceVisibility).toEqual({ 'default-setup/notes': false });
    expect(system.visibilitySent()).toEqual([{
      to: 'host/application',
      from: 'host',
      call: expect.any(String), 
      event: { type: 'SURFACE_VISIBILITY_UPDATED', surfaceVisibility: { 'default-setup/logs': false, 'default-setup/notes': false } },
    }]);
  });

  it('records the surface last open', () => {
    const system = runApplicationSystem();

    system.send({ type: 'SET_LAST_ACTIVE_SURFACE', surface: 'default-setup/threads' });

    expect(appState.get().lastActiveSurface).toBe('default-setup/threads');
  });

  // A bare id names no surface, so nothing could ever read the choice back
  it('ignores a surface id that is not a ref', () => {
    const system = runApplicationSystem();

    system.send({ type: 'SET_SURFACE_VISIBILITY', surface: 'notes', visible: false });
    system.send({ type: 'SET_LAST_ACTIVE_SURFACE', surface: 'threads' });

    expect(appState.get()).toMatchObject({ surfaceVisibility: {} });
    expect(appState.get().lastActiveSurface).toBeUndefined();
    expect(system.visibilitySent()).toEqual([]);
  });

  it("sends the visibility when asked to publish, since a pack brings or takes its features' defaults", () => {
    const system = runApplicationSystem({ 'memo-pack/memos': false });

    system.send({ type: 'SEND_STATE' });

    expect(system.visibilitySent()).toEqual([{ to: 'host/application', from: 'host', call: expect.any(String), event: expect.objectContaining({ surfaceVisibility: { 'memo-pack/memos': false } }) }]);
  });

  // The window's second app-level fact: an editor's command popup reads the shell, never a surface, so a window
  // with no chat open still has the list. The whole path is in default-setup's `extensions/tiptap/command-items`
  it('sends the commands when asked to publish, so every window holds them whatever is open', () => {
    const system = runApplicationSystem();

    system.send({ type: 'SEND_STATE' });

    expect(system.commandsSent()).toEqual([expect.objectContaining({ to: 'host/application', event: { type: 'COMMANDS_UPDATED', commands: COMMANDS } })]);
  });

  // The designation's owner says *that* they moved and the app reads them again; nothing holds a copy to compare
  it('sends them again when the owner says they changed', () => {
    const system = runApplicationSystem();

    system.send({ type: 'COMMANDS_CHANGED' });

    expect(system.commandsSent()).toHaveLength(1);
  });
});


it('publishes accepted runtime lifetimes through ordinary state requests without persisting them', () => {
  const sent: Message[] = [];
  const stopListening = testRootEvents.onSurfaceSend(message => { sent.push(message); });
  const actor = createActor(createApplicationSystem(registry)).start();
  const id = 'runtime-publication';
  const origin = { id, declarationRevision: 'fixture', name: 'Runtime publication', version: '1.0.0', dir: '/fixture/runtime-publication' };
  try {
    registry.registerPack({ id }, origin);
    const before = structuredClone(appState.get());
    actor.send({ type: 'SEND_STATE' });
    expect(sent.find(message => message.event.type === 'PACK_RUNTIMES_UPDATED')?.event).toEqual({
      type: 'PACK_RUNTIMES_UPDATED', runtimes: { [id]: registry.getPackRuntime(id)!.registrationId },
    });
    const first = registry.getPackRuntime(id)!.registrationId;
    registry.replacePack({ id }, origin);
    sent.length = 0;
    actor.send({ type: 'SEND_STATE' });
    const current = registry.getPackRuntime(id)!.registrationId;
    expect(current).not.toBe(first);
    expect(sent.find(message => message.event.type === 'PACK_RUNTIMES_UPDATED')?.event).toEqual({
      type: 'PACK_RUNTIMES_UPDATED', runtimes: { [id]: current },
    });
    registry.unregisterPack(id);
    sent.length = 0;
    actor.send({ type: 'SEND_STATE' });
    expect(sent.find(message => message.event.type === 'PACK_RUNTIMES_UPDATED')?.event).toEqual({ type: 'PACK_RUNTIMES_UPDATED', runtimes: {} });
    expect(appState.get()).toEqual(before);
  } finally {
    if (registry.getPackRegistration(id)) registry.unregisterPack(id);
    actor.stop();
    stopListening();
  }
});
