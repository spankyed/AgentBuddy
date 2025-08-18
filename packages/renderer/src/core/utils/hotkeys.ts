// Hotkey utilities and types
import type { KeyboardShortcut } from '@app/api';

export interface HotkeyEvent {
  type: 'HOTKEY_PRESSED';
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
}

export type HotkeysMap = {
  [action: string]: KeyboardShortcut | null | undefined;
}

export interface PluginHotkeyDefinition {
  action: string; // Action name that maps to handler in state machine
  global?: boolean; // If true, hotkey works regardless of active plugin
}

// Check if a HotkeyEvent matches a KeyboardShortcut
export function matchesHotkey(event: HotkeyEvent, config: KeyboardShortcut): boolean {
  if (!config?.key) return false;
  
  const modifierMatch = 
    (config.modifiers.includes('cmd') === event.metaKey) &&
    (config.modifiers.includes('ctrl') === event.ctrlKey) &&
    (config.modifiers.includes('alt') || config.modifiers.includes('option') ? event.altKey : !event.altKey) &&
    (config.modifiers.includes('shift') === event.shiftKey);
  
  return event.key === config.key && modifierMatch;
}

// Process hotkeys with action map - returns matched action value or undefined
// Accepts any object where the keys we care about have KeyboardShortcut values
export function processHotkeys<const T extends Record<string, string>, H = any>(
  event: HotkeyEvent,
  hotkeys: H | undefined,
  actionMap: T
): T[keyof T] | undefined {
  if (!hotkeys) return undefined;
  
  for (const actionName of Object.keys(actionMap) as (keyof T)[]) {
    const hotkeyConfig = (hotkeys as any)[actionName as string];
    if (hotkeyConfig && matchesHotkey(event, hotkeyConfig as KeyboardShortcut)) {
      event.preventDefault();
      return actionMap[actionName];
    }
  }
  
  return undefined;
}

// Create a hotkey processor action for XState machines
// Usage: handleHotkey: createHotkeyProcessor({ actionName: 'EVENT_TYPE' })
export function createHotkeyProcessor<
  const TMap extends Record<string, string>,
  TContext extends { hotkeys: HotkeysMap } = { hotkeys: HotkeysMap },
  TEvent = HotkeyEvent
>(actionMap: TMap) {
  return ({ event, context, self }: {
    event: TEvent;
    context: TContext;
    self: { send: (event: { type: TMap[keyof TMap] }) => void };
  }) => {
    const hotkeyEvent = event as HotkeyEvent;
    
    const actionType = processHotkeys(
      hotkeyEvent,
      context.hotkeys,
      actionMap
    );
    
    if (actionType) {
      self.send({ type: actionType });
    }
  };
}