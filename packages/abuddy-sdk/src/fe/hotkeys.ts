export interface KeyboardShortcut {
  key: string;
  modifiers: string[];
  global?: boolean;
}

export interface HotkeyEvent {
  type: 'HOTKEY_PRESSED';
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  allowedActions?: Set<string>;
  preventDefault: () => void;
}

export type HotkeysMap = {
  [action: string]: KeyboardShortcut | null | undefined;
}

export interface PluginHotkeyDefinition {
  action: string;
  global?: boolean;
}

export function matchesHotkey(event: HotkeyEvent, config: KeyboardShortcut): boolean {
  if (!config?.key) return false;

  const modifierMatch =
    (config.modifiers.includes('cmd') === event.metaKey) &&
    (config.modifiers.includes('ctrl') === event.ctrlKey) &&
    (config.modifiers.includes('alt') || config.modifiers.includes('option') ? event.altKey : !event.altKey) &&
    (config.modifiers.includes('shift') === event.shiftKey);

  return event.key.toLowerCase() === config.key.toLowerCase() && modifierMatch;
}

export function processHotkeys<const T extends Record<string, string>, H = any>(
  event: HotkeyEvent,
  hotkeys: H | undefined,
  actionMap: T
): T[keyof T] | undefined {
  if (!hotkeys) return undefined;

  for (const actionName of Object.keys(actionMap) as (keyof T)[]) {
    if (event.allowedActions && !event.allowedActions.has(actionName as string)) continue;
    const hotkeyConfig = (hotkeys as any)[actionName as string];
    if (hotkeyConfig && matchesHotkey(event, hotkeyConfig as KeyboardShortcut)) {
      event.preventDefault();
      return actionMap[actionName];
    }
  }

  return undefined;
}

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
