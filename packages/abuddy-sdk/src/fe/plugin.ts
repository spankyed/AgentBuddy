import type { Component } from 'vue';
import type { AnyStateMachine } from 'xstate';
import type { PluginHotkeyDefinition } from './hotkeys.ts';

type RouteName = string;
export type RouteComponents = Record<RouteName, Component>;

/**
 * A pack's plugin module, as its author writes it. It has no id: the plugin is registered at its
 * feature's address, `<packId>.<featureId>`, and pack code reaches it by name (`actorOf`,
 * `navigateToPlugin` from `#generated/fe`).
 */
export type PluginDefinition = Omit<Plugin, 'id'>;

/** A registered plugin: its definition, at its address */
export interface Plugin {
  /** The plugin's address, `<packId>.<featureId>`, or a bare id for the host's own */
  id: string;
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
