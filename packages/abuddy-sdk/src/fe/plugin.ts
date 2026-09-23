import type { FeatureRef } from '../ids/refs.ts';
import type { Component } from 'vue';
import type { AnyStateMachine, SnapshotFrom } from 'xstate';
import type { PluginHotkeyDefinition } from './hotkeys.ts';

type RouteName = string;
export type RouteComponents = Record<RouteName, Component>;

/**
 * A pack's plugin module, as its author writes it. It has no id: the plugin is registered at its
 * feature's ref, `<packId>/<featureId>`; pack code opens it by name (`navigateToPlugin` from `#generated/fe`),
 * and its components reach its actor with `usePlugin()`.
 */
export type PluginDefinition = Omit<Plugin, 'id'>;

/** What a plugin's `accepts` export carries: the events another plugin may send it, as a phantom type. */
export interface PluginAccepts<TAccepts extends { type: string } = never> {
  /** Phantom: the events *another* plugin may send this one, which codegen reads them from */
  _accepts: TAccepts;
}

/**
 * Declare the events other plugins may send this one, as a named `accepts` export beside the plugin:
 *
 * ```ts
 * export const accepts = pluginAccepts<ActionsListEvent>();
 * export default definePlugin({ label: 'Actions', icon, state, canvas });
 * ```
 *
 * Its own feature's system needs no declaration: what that system sends is already its outgoing union, and codegen
 * adds it. This is for the rest — what another feature's or another pack's frontend sends it, which nothing else
 * says — and it is the plugin's published contract, the only events a dependent pack may send.
 *
 * It takes no arguments on purpose, as `defineSystem()` does: codegen reads its type from this declaration alone,
 * without resolving the plugin's machine, whose own imports would cycle back through `#generated/events`.
 */
export function pluginAccepts<TAccepts extends { type: string } = never>(): PluginAccepts<TAccepts> {
  return {} as PluginAccepts<TAccepts>;
}

/** Define a pack's plugin. Its inbox is declared beside it, with `pluginAccepts()`. */
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
