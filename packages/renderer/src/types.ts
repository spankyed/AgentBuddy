export type { Plugin } from '@apackdev/host/fe';
export type { RouteComponents } from '@apackdev/sdk/fe';

export {
  type HotkeyEvent,
  type HotkeysMap,
  type PluginHotkeyDefinition,
  matchesHotkey,
  processHotkeys,
  createHotkeyProcessor
} from '@apackdev/sdk/fe';
