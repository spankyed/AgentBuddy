// Compile-time checks, run by `tsc` (npm run typecheck:pack). Exact type equality and expected
// errors fail if the generated events regress to `any` or accept a wrong event.
import { describe, expectTypeOf, it } from 'vitest';
import type { HostPluginEvents } from '@abuddy/sdk/services';
import type { ApplicationHotkeys } from '@abuddy/sdk/types';
import type { EARS } from '@/__generated__/ears';
import { emit, sendToPlugin, type PackEvents } from '@/__generated__/events';
import type { OutgoingActionEvents } from '@/features/actions/be/system';
import type { OutgoingFlowsEvents } from '@/features/flows/be/system';
import type { OutgoingThreadsEvents } from '@/features/threads/be/system';

declare const actionEvent: OutgoingActionEvents;
declare const hotkeys: ApplicationHotkeys;

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
