import type { ActionArgs, ParameterizedObject } from 'xstate';
import { safeEvents } from '../helpers/actor-helpers.ts';
import { _currentDelivery, _replyTo, type Reply } from '../events/index.ts';
import type { ArrayChanges } from '../utils/change-detection.ts';
import { eventTypes } from '../events/event-types.ts';

/** The events every system accepts: the app sends them, so no system declares them */
export type SystemEvents =
  /**
   * Publish what you hold now — the one event that asks for data, and the only one most systems handle.
   *
   * It follows every fact below, so a system does not wire "send my startup data" once per cause and a new
   * cause costs it nothing. Handle a fact as well only for what publishing cannot fix: work held over rows
   * that are gone, state that tracks whether a client is attached.
   */
  | { type: 'SEND_STATE' }
  /** A client connected. Most systems need only the `SEND_STATE` that follows it */
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
   * Every row the app holds was replaced — reset, or a backup imported — and the new world is built.
   *
   * Handling it is optional: the bus also asks every system for its startup data, so a plugin's view is
   * refreshed either way. Declare it only for what re-reading cannot fix, such as work held over rows that
   * are now gone.
   */
  | { type: 'DATA_REPLACED' }

/**
 * The event types every system accepts, as a value: a send of one to a feature that runs no system is nobody's, and
 * dropped without a warning.
 */
export const SYSTEM_EVENT_TYPES = eventTypes<SystemEvents>()('SEND_STATE', 'CLIENT_CONNECTED', 'PACK_CHANGED', 'FEATURE_SETTINGS_UPDATED', 'DATA_REPLACED');

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

// One `Contract*` per field of `SystemContract` above, whether or not the SDK reads it yet: a field and its reader
// are added together, so neither a count of the readers nor a search decides where the next one goes. The names
// generated code is written in are a separate layer (`IncomingEventsOf` and its neighbours, `events/index.ts`),
// built on these.
//
// Each reads a field that may be absent, so each is a conditional: an indexed access would answer from
// `SystemContract`'s own optional members and widen an omitted `internal` to `{ type: string }` rather than
// narrowing it to nothing.

/** The events a contract says the system receives from outside itself — what a sender may write */
export type ContractIncoming<C> = C extends { incoming: infer Events } ? Events : never;
/** The events a contract says the system's own children send it; nobody else's to send */
export type ContractInternal<C> = C extends { internal: infer Events } ? Events : never;
/** The events a contract says the system sends to plugins */
export type ContractOutgoing<C> = C extends { outgoing: infer Events } ? Events : never;
/** A contract's context, `{}` when it declares none */
export type ContractContext<C> = C extends { context: infer Context } ? Context : {};

/**
 * Everything the machine handles: what others send it, what its own children send it, and the app's. `Extract`
 * rather than a bare union because the conditionals above defer, and `safeEvents` needs a parameter it can see
 * is an event.
 */
type MachineEvents<C> = Extract<ContractIncoming<C> | ContractInternal<C> | SystemEvents, { type: string }>;

/**
 * The arguments XState hands a handler, for this system's context and events.
 *
 * It is the real thing rather than an approximation: `ActionArgs` is `UnifiedArg`, whose only type parameters
 * are the context and the event union — `self` carries `Record<string, AnyActorRef | undefined>` for its
 * children and `system` is `AnyActorSystem`, neither specialised per machine. So a spec that knows the
 * contract can build exactly what XState would, and wrapping costs no fidelity.
 */
type SystemArgs<C extends SystemContract> = ActionArgs<ContractContext<C>, MachineEvents<C>, MachineEvents<C>>;

/**
 * The params each action takes, keyed by name — what XState infers its own `TActions` from, and so what this
 * wrapper has to be shaped around.
 *
 * The first attempt returned a mapped type whose values were a *conditional* over the handler given
 * (`F extends (args, params: infer P) => void ? …`). TypeScript cannot invert a deferred conditional, so
 * XState inferred nothing and every action name in the machine config became "not assignable to Actions<…>".
 * Taking the params map as the type parameter instead is how XState itself does it, and it infers from the
 * same place: each handler's second argument.
 */
type ActionParams = Record<string, ParameterizedObject['params'] | undefined>;

/**
 * Whether this is a handler to wrap or an action creator's result to leave alone.
 *
 * Every creator XState exposes — `assign`, `enqueueActions`, `spawnChild`, `raise`, `sendTo`, `sendParent`,
 * `emit`, `log`, `cancel`, `stopChild` — returns a function carrying an own `resolve`, which is how XState
 * resolves it later; a handler written by hand has no own properties at all. Wrapping one of those would
 * hide the property XState resolves it through, so the test is what keeps them whole.
 */
const isCreatorResult = (value: unknown): boolean =>
  typeof value === 'function' && Object.prototype.hasOwnProperty.call(value, 'resolve');

/** Hands a handler the answer for the delivery it is being run in, bound at entry */
const handing = <F>(handler: F): F => {
  if (typeof handler !== 'function' || isCreatorResult(handler)) return handler;
  const run = handler as unknown as (args: object, params: unknown) => void;
  return ((args: object, params: unknown) =>
    run({ ...args, reply: _replyTo(_currentDelivery()) }, params)) as unknown as F;
};

/** The definition object returned by `defineSystem()`. */
export interface SystemSpec<C extends SystemContract> {
  types: { context: ContractContext<C>; events: MachineEvents<C> };
  typeOf: ReturnType<typeof safeEvents<MachineEvents<C>>>;
  /**
   * The system's actions, each handed the answer for the message it is handling.
   *
   * `reply` is absent when that message named no sender, so a handler that answers has to say what it does
   * when nobody asked — the question `_currentDelivery()?.replyTo === undefined` used to ask of a global.
   *
   * **It wraps the record, never `setup`.** What XState receives is exactly the type it expects, so its
   * inference, `SetupReturn.extend`/`createAction` and the prebound creators are all untouched. An action
   * creator's result passes through whole, which gives the rule: an action that answers is a plain function.
   */
  actions<P extends ActionParams>(
    defs: { [K in keyof P]: (args: SystemArgs<C> & { reply?: Reply }, params: P[K]) => void },
  ): { [K in keyof P]: (args: SystemArgs<C>, params: P[K]) => void };
  /**
   * An `invoke.input`, handed the same answer, so an invoked actor receives one through its input.
   *
   * `input` is evaluated while the transition is being processed — inside the delivery — which is what makes
   * this work and what makes the answer it hands on bound rather than ambient.
   */
  input<I>(build: (args: SystemArgs<C> & { reply?: Reply }) => I): (args: SystemArgs<C>) => I;
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
    actions: (defs) => Object.fromEntries(
      Object.entries(defs).map(([name, handler]) => [name, handing(handler)]),
    ) as never,
    input: (build) => (args) => build({ ...args, reply: _replyTo(_currentDelivery()) }),
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
