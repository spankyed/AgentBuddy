import type { Component } from 'vue';
import type { AnyStateMachine } from 'xstate';
import type { PluginHotkeyDefinition } from './hotkeys';

type RouteName = string;
export type RouteComponents = Record<RouteName, Component>;

export interface Plugin {
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
