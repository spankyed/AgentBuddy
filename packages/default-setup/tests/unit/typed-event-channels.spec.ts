// Compile-time checks, run by `tsc` (npm run typecheck:pack). Exact type equality and expected
// errors fail if the generated events regress to `any` or accept a wrong event.
import { describe, expectTypeOf, it } from 'vitest';
import type { HostPluginEvents } from '@abuddy/sdk/events';
import type { ApplicationHotkeys } from '@abuddy/sdk/types';
import type { EARS } from '@/__generated__/ears';
import type { Services } from '@/__generated__/services';
import { emit, sendToPlugin, sendToSystem, type PackEvents } from '@/__generated__/events';
import type { OutgoingActionEvents } from '@/features/actions/be/system';
import type { OutgoingFlowsEvents } from '@/features/flows/be/system';
import type { OutgoingThreadsEvents } from '@/features/threads/be/system';

declare const actionEvent: OutgoingActionEvents;
declare const hotkeys: ApplicationHotkeys;
// What a seed action receives
declare const services: Services;

describe('PackEvents', () => {
  it('maps each plugin to exactly the events it receives', () => {
    expectTypeOf<PackEvents['threads']>().toEqualTypeOf<OutgoingThreadsEvents>();
    // The flows plugin receives its own system's events and the actions system's (sendsTo)
    expectTypeOf<PackEvents['flows']>().toEqualTypeOf<OutgoingFlowsEvents | OutgoingActionEvents>();
    expectTypeOf<PackEvents['application']>().toEqualTypeOf<HostPluginEvents['application']>();
  });

  it('has no entry for a plugin nothing sends to', () => {
    // @ts-expect-error not a plugin of this pack, its dependencies or the host
    expectTypeOf<PackEvents['unknown-plugin']>().toBeNever();
  });
});

describe('emit and sendToPlugin', () => {
  // Wrapped in functions that never run: only their types are checked
  it('accept an event the plugin receives', () => {
    const wrapped = emit('threads', { type: 'THREAD_CREATED', id: 't1' as EARS.EntityId, shortCode: 'T1', entityType: 'Thread' as EARS.Entity, timestamp: 0 });
    expectTypeOf(wrapped.event.pluginId).toEqualTypeOf<'threads'>();
    expectTypeOf(() => {
      emit('flows', actionEvent);
      emit('application', { type: 'APPLICATION_HOTKEYS', hotkeys });
      sendToPlugin('application', { type: 'APPLICATION_RESTORE_LAST_PLUGIN', lastActivePluginId: 'notes' });
    }).toBeFunction();
  });

  it('reject an event the plugin does not receive', () => {
    expectTypeOf(() => {
      // @ts-expect-error the threads plugin doesn't receive action events
      emit('threads', actionEvent);
      // @ts-expect-error not an application event
      emit('application', { type: 'SETTINGS_LOADED' });
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
      sendToSystem('settings', { type: 'GET_SETTINGS' });
    }).toBeFunction();
  });

  it('rejects an unknown system, an unknown event type and a missing field', () => {
    expectTypeOf(() => {
      // @ts-expect-error not a system of this pack or its dependencies
      sendToSystem('unknown-system', { type: 'GET_SETTINGS' });
      // @ts-expect-error the settings system doesn't receive this event
      sendToSystem('settings', { type: 'DELETE_NOTE', id: 'Note-1' });
      // @ts-expect-error DELETE_NOTE needs an id
      sendToSystem('notes', { type: 'DELETE_NOTE' });
    }).toBeFunction();
  });

  it('accepts a type typed as a union when the event has every named event\'s fields', () => {
    expectTypeOf((brainIsDead: boolean) => {
      sendToSystem('brain', { type: brainIsDead ? 'START_BRAIN' : 'RESTART_BRAIN' });
      // @ts-expect-error as a DELETE_NOTE it would have no id
      sendToSystem('notes', { type: brainIsDead ? 'DELETE_NOTE' : 'CREATE_NOTE' });
    }).toBeFunction();
  });

  it('rejects a system id typed as a union', () => {
    expectTypeOf((systemId: 'notes' | 'settings') => {
      // @ts-expect-error the notes system doesn't receive GET_SETTINGS
      sendToSystem(systemId, { type: 'GET_SETTINGS' });
    }).toBeFunction();
  });
});

describe('services.emitter in actions', () => {
  // Wrapped in functions that never run: only their types are checked
  it('accepts an event the plugin or system receives', () => {
    expectTypeOf(() => {
      services.emitter.sendToPlugin('database', { type: 'AI_QUERY_LOADING' });
      services.emitter.sendToSystem('default-setup/notes', { type: 'DELETE_NOTE', id: 'Note-1' });
      services.emitter.sendToBrainSystem({ eventType: 'user.message' });
    }).toBeFunction();
  });

  it('rejects an event the plugin or system does not receive', () => {
    expectTypeOf(() => {
      // @ts-expect-error the database plugin doesn't receive this event
      services.emitter.sendToPlugin('database', { type: 'SET_PHASE', phase: 'Edit' });
      // @ts-expect-error unknown plugin
      services.emitter.sendToPlugin('unknown-plugin', { type: 'ANYTHING' });
      // @ts-expect-error DELETE_NOTE needs an id
      services.emitter.sendToSystem('default-setup/notes', { type: 'DELETE_NOTE' });
      // @ts-expect-error actions name every system <pack>/<feature>
      services.emitter.sendToSystem('notes', { type: 'DELETE_NOTE', id: 'Note-1' });
    }).toBeFunction();
  });
});
