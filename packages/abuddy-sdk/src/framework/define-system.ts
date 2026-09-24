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

/**
 * What a system's contract declares. A feature exports one as `Contract` from its `be/contract.ts`, and `abuddy.json`
 * names it at `features[].system.contract`:
 *
 * ```ts
 * export type Contract = {
 *   context: LogsContext
 *   incoming: IncomingLogEvents
 *   internal: LogsInternalEvents
 *   outgoing: OutgoingLogsEvents
 * }
 * ```
 *
 * Fields, not positions. `internal` is what the system's own children send it — a `fromCallback` child telling its
 * parent — and it reaches the machine's event union and nothing a dependent pack can see; as a fourth positional
 * type parameter it would have been a slot every call had to skip past, which is why the split waited for this.
 * `incoming`, `internal` and `context` may each be omitted.
 */
export interface SystemContract {
  context?: unknown;
  incoming?: { type: string };
  internal?: { type: string };
  outgoing: { type: string };
}

// Each reads a field that may be absent, so each is a conditional: an indexed access would answer from
// `SystemContract`'s own optional members and widen an omitted `internal` to `{ type: string }` rather than
// narrowing it to nothing.

/** The events a contract says the system receives from outside itself — what a sender may write */
export type ContractIncoming<C> = C extends { incoming: infer Events } ? Events : never;
/** The events a contract says the system's own children send it; nobody else's to send */
export type ContractInternal<C> = C extends { internal: infer Events } ? Events : never;
/** The events a contract says the system sends its plugin, which codegen reads that plugin's inbox from */
export type ContractOutgoing<C> = C extends { outgoing: infer Events } ? Events : never;
/** A contract's context, `{}` when it declares none */
export type ContractContext<C> = C extends { context: infer Context } ? Context : {};

/**
 * Everything the machine handles: what others send it, what its own children send it, and the app's. `Extract`
 * rather than a bare union because the conditionals above defer, and `safeEvents` needs a parameter it can see
 * is an event.
 */
type MachineEvents<C> = Extract<ContractIncoming<C> | ContractInternal<C> | SystemEvents, { type: string }>;

/** The definition object returned by `defineSystem()`. */
export interface SystemSpec<C extends SystemContract> {
  types: { context: ContractContext<C>; events: MachineEvents<C> };
  typeOf: ReturnType<typeof safeEvents<MachineEvents<C>>>;
}

/**
 * Define a backend system from its feature's contract: the events it receives, those its own children send it,
 * those it sends to plugins, and its context. Its identity is its feature's: the manifest names the system module
 * under the feature, which runs it at `<packId>/<featureId>`, and the pack's code names it by the feature id.
 *
 * ```ts
 * import type { Contract } from './contract';
 * export const logsSpec = defineSystem<Contract>();
 * ```
 *
 * It carries no phantom properties. Codegen reads the events from the contract the manifest names — a declared
 * type, read without running anything — rather than from this value's type, which is what made an annotation on
 * the system's default export silently drop them.
 */
export function defineSystem<C extends SystemContract>(): SystemSpec<C> {
  return {
    types: {
      context: {} as ContractContext<C>,
      events: {} as MachineEvents<C>,
    },
    typeOf: safeEvents<MachineEvents<C>>(),
  };
}

/**
 * Whether a system entry's machine was built from the contract given: `true`, or a sentence saying how they differ.
 *
 * `abuddy.json` names the contract the feature's facade publishes, and `defineSystem<Contract>()` types the machine.
 * They are two references to one type, and nothing in either place makes them the same one — a machine built from
 * some other contract compiles, and its feature then publishes events it never handles and handles events its
 * dependents can't send. Codegen asserts one of these per feature in the pack entry, so the pack's own typecheck
 * says so.
 *
 * It compares the specs rather than the contracts, since `SystemSpec` is what carries a contract into the machine:
 * its context and its event union. A contract's `outgoing` is deliberately outside that comparison — the machine
 * never types a send from its spec, so a difference there is the facade's business and this check's blind spot.
 */
export type MachineMatchesContract<Entry, C extends SystemContract> =
  // One tuple rather than two nested conditionals: it is element-wise assignability both ways, and it defers
  Entry extends { spec: infer Spec }
    ? [Spec, SystemSpec<C>] extends [SystemSpec<C>, Spec]
      ? true
      : 'this system\'s defineSystem<…> declares a contract that is not the one abuddy.json names for its feature'
    : 'this system\'s default export has no `spec` from defineSystem<…>';
