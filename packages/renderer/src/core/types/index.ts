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

export interface HotkeyDefinition<TContext = any> {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  description: string;
  handler: (params: {
    event: HotkeyEvent;
    context: TContext;
    self?: any;
    system?: any;
  }) => void;
}

export function matchesHotkey(event: HotkeyEvent, hotkey: HotkeyDefinition<any>): boolean {
  return (
    event.key === hotkey.key &&
    (hotkey.metaKey === undefined || event.metaKey === hotkey.metaKey) &&
    (hotkey.ctrlKey === undefined || event.ctrlKey === hotkey.ctrlKey) &&
    (hotkey.altKey === undefined || event.altKey === hotkey.altKey) &&
    (hotkey.shiftKey === undefined || event.shiftKey === hotkey.shiftKey)
  );
}

export function handleHotkeyEvent<TContext>(
  event: any,
  hotkeys: HotkeyDefinition<TContext>[],
  context: TContext,
  self?: any,
  system?: any
): void {
  const hotkeyEvent = event as HotkeyEvent;
  
  // Find and execute matching hotkey handler
  const matchingHotkey = hotkeys.find(hotkey => matchesHotkey(hotkeyEvent, hotkey));
  
  if (matchingHotkey) {
    matchingHotkey.handler({ event: hotkeyEvent, context, self, system });
  }
}

export function createHotkeyHandler<TContext>(hotkeys: HotkeyDefinition<TContext>[]) {
  return ({ event, context, self, system }: { event: any; context: TContext; self?: any; system?: any }) => {
    handleHotkeyEvent(event, hotkeys, context, self, system);
  };
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
