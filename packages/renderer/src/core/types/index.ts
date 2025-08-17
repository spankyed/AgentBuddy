// plugins/types.ts
import type { Component } from 'vue';
import type { AnyStateMachine } from 'xstate';

type RouteName = string;
export type RouteComponents = Record<RouteName, Component>;

export interface HotkeyEvent {
  type: 'HOTKEY_PRESSED';
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
}

export interface Plugin {
  /** Toolbar key */
  id: string;
  label: string;
  icon?: Component;
  /** XState definition – the host will spin up the actor lazily */
  state: AnyStateMachine;
  /** UI fragments (omit one to fall back to Main) */
  canvas?: Component | RouteComponents;
  panel?: Component;
  chat?: Component;
  isPinned?: boolean;
  /** Settings component for plugin-specific configuration */
  settings?: Component;
  /** Optional plugin configuration */
  options?: {
    /** Custom header class for the canvas area */
    headerClass?: string;
  };
}
