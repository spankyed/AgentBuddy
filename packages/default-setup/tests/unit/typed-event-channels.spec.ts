// Compile-time checks, run by `vue-tsc` (npm run typecheck:pack). Exact type equality and expected
// errors fail if the generated events regress to `any` or accept a wrong event.
import { describe, expectTypeOf, it } from 'vitest';
import type { HostPluginEvents } from '@abuddy/sdk/events';
import type { ApplicationHotkeys } from '@abuddy/sdk/types';
import type { EARS } from '@/__generated__/ears';
import type { Services } from '@/__generated__/services';
import { sendToPlugin, sendToSystem, type SendablePluginEvents } from '@/__generated__/events';
import { navigateToPlugin } from '@/__generated__/fe';
import type { OutgoingActionEvents } from '@/features/actions/be/system';
import type { OutgoingFlowsEvents } from '@/features/flows/be/system';
import type { OutgoingThreadsEvents } from '@/features/threads/be/system';

declare const actionEvent: OutgoingActionEvents;
declare const hotkeys: ApplicationHotkeys;
// What a seed action receives
declare const services: Services;

describe('SendablePluginEvents', () => {
  it('maps each plugin to exactly the events it receives', () => {
    expectTypeOf<SendablePluginEvents['threads']>().toEqualTypeOf<OutgoingThreadsEvents>();
    // The flows plugin receives its own system's events and the actions system's (sendsTo)
    expectTypeOf<SendablePluginEvents['flows']>().toEqualTypeOf<OutgoingFlowsEvents | OutgoingActionEvents>();
    expectTypeOf<SendablePluginEvents['host/application']>().toEqualTypeOf<HostPluginEvents['host/application']>();
  });

  it('has no entry for a plugin nothing sends to', () => {
    // @ts-expect-error not a plugin of this pack, its dependencies or the host
    expectTypeOf<SendablePluginEvents['unknown-plugin']>().toBeNever();
  });
});

describe('sendToPlugin', () => {
  // Wrapped in functions that never run: only their types are checked
  it('accepts an event the plugin receives', () => {
    expectTypeOf(() => {
      sendToPlugin('threads', { type: 'THREAD_CREATED', id: 't1' as EARS.EntityId, shortCode: 'T1', entityType: 'Thread' as EARS.Entity, timestamp: 0 });
      sendToPlugin('flows', actionEvent);
      sendToPlugin('host/application', { type: 'APPLICATION_HOTKEYS', hotkeys });
      sendToPlugin('host/application', { type: 'PLUGIN_VISIBILITY_UPDATED', pluginVisibility: { 'default-setup/notes': false } });
    }).toBeFunction();
  });

  it('rejects an event the plugin does not receive', () => {
    expectTypeOf(() => {
      // @ts-expect-error the threads plugin doesn't receive action events
      sendToPlugin('threads', actionEvent);
      // @ts-expect-error not an application event
      sendToPlugin('host/application', { type: 'SETTINGS_LOADED' });
      // @ts-expect-error unknown plugin
      sendToPlugin('unknown-plugin', { type: 'ANYTHING' });
    }).toBeFunction();
  });
});

describe('sendToSystem', () => {
  // Wrapped in functions that never run: only their types are checked
  it('accepts an event the system receives', () => {
    expectTypeOf(() => {
      sendToSystem('settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'notes', path: ['sort'], value: 'title' });
      sendToSystem('notes', { type: 'DELETE_NOTE', id: 'Note-1' });
      // System to system, as a backend system sends another: the same typed send
      sendToSystem('brain', { type: 'TRIGGER_BRAIN_EVENT', eventType: 'thread.fork' });
      sendToSystem('threads', { type: 'BIRTH_FLOW_START' });
      // A role reaches whichever system plays it
      sendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', eventType: 'thread.fork' });
      // The host's systems, by ref
      sendToSystem('host/bus', { type: 'PACK_CHANGED', packId: 'default-setup' });
    }).toBeFunction();
  });

  it('rejects an unknown system, an unknown event type, a missing field and a union system or type', () => {
    expectTypeOf((systemId: 'notes' | 'settings', brainIsDead: boolean) => {
      // @ts-expect-error not a system of this pack or its dependencies
      sendToSystem('unknown-system', { type: 'GET_SETTINGS' });
      // @ts-expect-error the settings system doesn't receive this event
      sendToSystem('settings', { type: 'DELETE_NOTE', id: 'Note-1' });
      // @ts-expect-error the brain doesn't receive what threads does, so a system can't send it one
      sendToSystem('brain', { type: 'BIRTH_FLOW_START' });
      // @ts-expect-error DELETE_NOTE needs an id
      sendToSystem('notes', { type: 'DELETE_NOTE' });
      // @ts-expect-error one system per send
      sendToSystem(systemId, { type: 'GET_SETTINGS' });
      // @ts-expect-error one event type per send
      sendToSystem('brain', { type: brainIsDead ? 'START_BRAIN' : 'RESTART_BRAIN' });
      // @ts-expect-error the bus receives only PACK_CHANGED from pack code
      sendToSystem('host/bus', { type: 'CLIENT_CONNECTED' });
    }).toBeFunction();
  });
});

describe('services.emitter in actions', () => {
  // Wrapped in functions that never run: only their types are checked
  it('accepts an event the plugin or system receives', () => {
    expectTypeOf(() => {
      services.emitter.sendToPlugin('default-setup/database', { type: 'AI_QUERY_LOADING' });
      services.emitter.sendToSystem('default-setup/notes', { type: 'DELETE_NOTE', id: 'Note-1' });
      services.emitter.sendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', eventType: 'user.message' });
    }).toBeFunction();
  });

  it('rejects an event the plugin or system does not receive', () => {
    expectTypeOf(() => {
      // @ts-expect-error the database plugin doesn't receive this event
      services.emitter.sendToPlugin('default-setup/database', { type: 'SET_PHASE', phase: 'Edit' });
      // @ts-expect-error unknown plugin
      services.emitter.sendToPlugin('unknown-plugin', { type: 'ANYTHING' });
      // @ts-expect-error actions name every pack plugin <pack>/<feature>, this pack's own too
      services.emitter.sendToPlugin('database', { type: 'AI_QUERY_LOADING' });
      // @ts-expect-error DELETE_NOTE needs an id
      services.emitter.sendToSystem('default-setup/notes', { type: 'DELETE_NOTE' });
      // @ts-expect-error actions name every system <pack>/<feature>
      services.emitter.sendToSystem('notes', { type: 'DELETE_NOTE', id: 'Note-1' });
    }).toBeFunction();
  });
});

describe('navigateToPlugin', () => {
  // Wrapped in functions that never run: only their types are checked
  it("takes this pack's plugins by feature id, and nothing it can't name", () => {
    expectTypeOf(() => {
      navigateToPlugin('notes');
      navigateToPlugin('settings', { type: 'TAB.SELECT', tab: 'plugins' });
      // @ts-expect-error a misspelled ref names no plugin
      navigateToPlugin('default-setp/notes');
      // @ts-expect-error nor does a misspelled feature id
      navigateToPlugin('noets');
      // @ts-expect-error a plugin named by data opens through openPlugin, which checks it at run time
      navigateToPlugin('whatever.anything');
    }).toBeFunction();
  });
});
