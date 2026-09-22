import { safeEvents } from '../helpers/actor-helpers.ts';
import type { ArrayChanges } from '../utils/change-detection.ts';
import { eventTypes } from '../events/event-types.ts';

/** The events every system accepts: the app sends them, so no system declares them */
export type SystemEvents =
  | { type: 'CLIENT_CONNECTED' }
  /**
   * A pack was activated, reloaded or torn down while the app runs, or its seeds were imported: what it
   * registers (its slash commands) and the data it seeded may differ. Sent once the change is complete.
   */
  | { type: 'PACK_CHANGED'; packId: string }
  /**
   * The feature's settings changed: `settings` as they now apply, and `changes` to what they list, when the store
   * tells them. The feature's plugin gets it too (`FeatureSettingsUpdated`).
   */
  | { type: 'FEATURE_SETTINGS_UPDATED'; settings: unknown; changes?: ArrayChanges | null }

/**
 * The event types every system accepts, as a value: a send of one to a feature that runs no system is nobody's, and
 * dropped without a warning.
 */
export const SYSTEM_EVENT_TYPES = eventTypes<SystemEvents>()('CLIENT_CONNECTED', 'PACK_CHANGED', 'FEATURE_SETTINGS_UPDATED');

/** The definition object returned by `defineSystem()`. */
export interface SystemSpec<
  TEvents extends { type: string },
  TOutgoing extends { type: string },
  TContext = {},
> {
  types: { context: TContext; events: TEvents | SystemEvents };
  typeOf: ReturnType<typeof safeEvents<TEvents | SystemEvents>>;
  /** Phantom: the events the system receives, as a sender writes them */
  _incoming: TEvents;
  /** Phantom: the events the system sends its plugin and those its `sendsTo` names, which codegen reads them from */
  _outgoing: TOutgoing;
}

/**
 * Define a backend system's event types: those it receives, those it sends to plugins, and its context. Its
 * identity is its feature's: the manifest names the system module under the feature, which runs it at
 * `<packId>/<featureId>`, and the pack's code names it by the feature id.
 *
 * ```ts
 * export const logsSpec = defineSystem<
 *   IncomingLogEvents | LogsInternalEvents,
 *   OutgoingLogsEvents,
 *   LogsContext
 * >();
 * ```
 */
export function defineSystem<
  TEvents extends { type: string },
  TOutgoing extends { type: string },
  TContext = {},
>(): SystemSpec<TEvents, TOutgoing, TContext> {
  return {
    types: {
      context: {} as TContext,
      events: {} as TEvents | SystemEvents,
    },
    typeOf: safeEvents<TEvents | SystemEvents>(),
    _incoming: undefined as any,
    _outgoing: undefined as any,
  };
}
