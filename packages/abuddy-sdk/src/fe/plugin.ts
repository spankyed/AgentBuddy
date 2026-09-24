import type { FeatureRef } from '../ids/refs.ts';
import type { Component } from 'vue';
import type { AnyStateMachine, SnapshotFrom } from 'xstate';
import type { PluginHotkeyDefinition } from './hotkeys.ts';

type RouteName = string;
export type RouteComponents = Record<RouteName, Component>;

/**
 * A pack's plugin module, as its author writes it. It has no id: the plugin is registered at its
 * feature's ref, `<packId>/<featureId>`; pack code opens it by name (`openPlugin` from `#generated/fe`),
 * and its components reach its actor with `usePlugin()`.
 */
export type PluginDefinition = Omit<Plugin, 'id'>;

/** The audiences a plugin's contract may open its inbox to, and what each one means. */
export interface PluginInboxAudiences {
  /** What this pack's own features may send it */
  pack?: { type: string };
  /** What a dependent pack may send it: the half that reaches the facade */
  public?: { type: string };
}

/**
 * Constrains the `inbox` half of a plugin's `Contract`, so a misspelled audience fails to compile rather than
 * declaring an inbox nobody can reach:
 *
 * ```ts
 * // features/notes/fe/types.ts
 * export type Contract = {
 *   state: NotesContext
 *   inbox: PluginInbox<{ public: { type: 'NOTE.OPEN'; noteId: string } }>
 * }
 * ```
 *
 * A feature's own system needs no declaration: what that system sends is already its outgoing union, and codegen
 * adds it. This is for the rest — what another feature's or another pack's frontend sends — which nothing else says.
 *
 * Codegen reads the contract as a *declared type* from the module `abuddy.json` names at
 * `features[].plugin.contract`, and from nowhere else: reading it from `fe/plugin.ts` would pull in the machine,
 * whose own imports cycle back through `#generated/events`. Nothing here exists at runtime.
 */
export type PluginInbox<T extends PluginInboxAudiences> = T;

/**
 * The state a plugin's `Contract` publishes — the whole of its context unless the contract narrows it with
 * `Pick<>`. Generated code builds each pack's `PackPluginState` with it, and the typed readers in `#generated/fe`
 * hand a selector this rather than an XState snapshot.
 *
 * Reads are public where sends are declared by audience, and the asymmetry is deliberate: a send changes the
 * plugin's behaviour, a read does not, and a dependent pack that could read nothing by default would have no way
 * to render what the user has open in someone else's plugin.
 */
export type PluginStateOf<C> = C extends { state: infer State } ? State : never;

/** Define a pack's plugin. What it publishes — its state and its inbox — is its `Contract` (`PluginInbox`). */
export function definePlugin(definition: PluginDefinition): PluginDefinition {
  return definition;
}

/** A registered plugin: its definition, at its ref */
export interface Plugin {
  /** The plugin's ref, `<packId>/<featureId>` (the host's own under `host`) */
  id: FeatureRef;
  label: string;
  isPinned?: boolean;
  state: AnyStateMachine;
  icon?: Component;
  canvas?: Component | RouteComponents;
  panel?: Component;
  /**
   * Offers this plugin's `panel` for plugins that have none of their own. The app shows it in their place while
   * `isShown` holds of this plugin's state, and its menu item (`label`) sends this plugin `toggle`. The app asks
   * only through these, never reading the plugin's state itself.
   */
  fallbackPanel?: {
    label: string;
    isShown: (snapshot: SnapshotFrom<AnyStateMachine>) => boolean;
    toggle: { type: string };
  };
  chat?: Component;
  settings?: Component;
  hotkeys?: PluginHotkeyDefinition[];
  options?: {
    headerClass?: string;
  };
}
