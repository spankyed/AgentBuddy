// The app is the pack `host`, so its messages say so: a drop or an unroutable send names who made it instead of
// leaving that to a grep. The unbound sends stamp nothing — they are what an action reaches through
// `services.emitter`, outside any pack — so absent is the ordinary case rather than a fault.
import { describe, expect, it } from 'vitest';
import type { Message } from '@abuddy/sdk/events';
import { untypedBroadcastToPlugin, untypedSendToSystem } from '@abuddy/sdk/events';
import { startTestRuntime, testRootEvents } from '@abuddy/sdk/testing';
import { HOST_ENTITY_TYPES } from '../src/app-state/index.ts';
import { broadcastToPlugin, sendToSystem } from '../src/events.ts';
import { HOST } from '../src/refs.ts';

startTestRuntime({ entityTypes: HOST_ENTITY_TYPES });

/** What a send emitted, whichever direction it went */
function emitted(send: () => void, listen: 'plugin' | 'system'): Message[] {
  const seen: Message[] = [];
  const stop = listen === 'plugin'
    ? testRootEvents.onPluginSend((message) => seen.push(message))
    : testRootEvents.onIncoming((message) => seen.push(message));
  try {
    send();
  } finally {
    stop();
  }
  return seen;
}

describe('the host sends as itself', () => {
  it('stamps a send to one of its own plugins, named as a pack names its own', () => {
    expect(emitted(() => broadcastToPlugin('settings', { type: 'SETTINGS_LOADED', data: { plugins: {} }, help: [] }), 'plugin'))
      .toEqual([{ to: HOST.settings, from: 'host', event: { type: 'SETTINGS_LOADED', data: { plugins: {} }, help: [] } }]);
  });

  it('stamps a send to one of its own systems', () => {
    expect(emitted(() => sendToSystem('packs', { type: 'GET_INSTALLED_PACKS' }), 'system'))
      .toEqual([{ to: HOST.packs, from: 'host', event: { type: 'GET_INSTALLED_PACKS' } }]);
  });

  // The unbound sends take a ref and check nothing: they are what an action reaches through `services.emitter`
  it('leaves a send made outside a pack unstamped, and unchecked', () => {
    expect(emitted(() => untypedBroadcastToPlugin(HOST.settings, { type: 'SETTINGS_LOADED' }), 'plugin'))
      .toEqual([{ to: HOST.settings, event: { type: 'SETTINGS_LOADED' } }]);
    expect(emitted(() => untypedSendToSystem(HOST.packs, { type: 'GET_PACKS' }), 'system'))
      .toEqual([{ to: HOST.packs, event: { type: 'GET_PACKS' } }]);
  });

  /** The map is the check: a name nothing declares, and an event that plugin doesn't take, are both compile errors */
  it('refuses a feature it has none of, and an event that feature does not take', () => {
    // @ts-expect-error the host has no `nope` feature
    expect(() => broadcastToPlugin('nope', { type: 'SETTINGS_LOADED', data: { plugins: {} }, help: [] })).toBeDefined();
    // @ts-expect-error the packs view doesn't take a settings event
    expect(() => broadcastToPlugin('packs', { type: 'SETTINGS_LOADED', data: { plugins: {} }, help: [] })).toBeDefined();
  });
});
