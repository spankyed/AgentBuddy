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
  id: string; // Toolbar key
  label: string;
  isPinned?: boolean;
  state: AnyStateMachine; // XState definition – the host will spin up the actor lazily
  icon?: Component;
  /** UI fragments (omit one to fall back to Main) */
  canvas?: Component | RouteComponents;
  panel?: Component;
  chat?: Component;
  settings?: Component; // Settings component for plugin-specific configuration
  hotkeys?: PluginHotkeyDefinition[];
  options?: {
    headerClass?: string; // Custom header class for the canvas area
  };
}
