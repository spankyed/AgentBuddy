import type { FeatureRef } from '../ids/addressing.ts';
import type { Component } from 'vue';
import type { AnyStateMachine, SnapshotFrom } from 'xstate';
import type { PluginHotkeyDefinition } from './hotkeys.ts';

type RouteName = string;
export type RouteComponents = Record<RouteName, Component>;

/**
 * A pack's plugin module, as its author writes it. It has no id: the plugin is registered at its
 * feature's address, `<packId>/<featureId>`; pack code opens it by name (`navigateToPlugin` from `#generated/fe`),
 * and its components reach its actor with `usePlugin()`.
 */
export type PluginDefinition = Omit<Plugin, 'id'>;

/** A registered plugin: its definition, at its address */
export interface Plugin {
  /** The plugin's address, `<packId>/<featureId>` (the host's own under `host`) */
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
