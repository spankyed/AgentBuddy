import type { FeatureRef } from '../ids/addressing.ts';
import type { Component } from 'vue';
import type { AnyStateMachine } from 'xstate';
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
  /** The plugin's address, `<packId>/<featureId>`, or a bare id for the host's own */
  id: FeatureRef;
  label: string;
  isPinned?: boolean;
  state: AnyStateMachine;
  icon?: Component;
  canvas?: Component | RouteComponents;
  panel?: Component;
  chat?: Component;
  settings?: Component;
  hotkeys?: PluginHotkeyDefinition[];
  options?: {
    headerClass?: string;
  };
}
