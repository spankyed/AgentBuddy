// plugins/types.ts
import type { Component } from 'vue';
import type { AnyStateMachine } from 'xstate';
import type { PluginHotkeyDefinition } from '@abuddy/sdk/fe';

type RouteName = string;
export type RouteComponents = Record<RouteName, Component>;

export {
  type HotkeyEvent,
  type HotkeysMap,
  type PluginHotkeyDefinition,
  matchesHotkey,
  processHotkeys,
  createHotkeyProcessor
} from '@abuddy/sdk/fe';

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
  designations?: string[];
  options?: {
    headerClass?: string;
  };
}
