export type { Plugin, RouteComponents } from './plugin'
export { pasteIntoElement } from './input-paste'
export { useActorSystem } from './composables/useActorSystem'
export { useApplicationActor } from './composables/useApplicationActor'
export { isAnyMenuOpen, onMenuOpenChange, useTrackedMenuOpen } from './composables/useMenuState'
export { useContextMenu } from './composables/useContextMenu'
export type { MenuItem } from './composables/useContextMenu'
export { useDebounce, useDebounceFn } from './composables/useDebounce'
export { useInfiniteScroll } from './composables/useInfiniteScroll'
export { useClickOutside } from './composables/useClickOutside'
export { useCollapsibleState } from './composables/useCollapsibleState'
export { useExternalFileDrag } from './composables/useExternalFileDrag'

export { default, default as breadcrumb, breadcrumbWithParams, breadcrumbList, staticBreadcrumbList } from './breadcrumb'
export { safeEvents, safeEvents as feSafeEvents, type ExtractEvent } from './safe-events'
export { contextMenu, contextMenuFn, type ContextMenuItem, type ContextMenuMeta } from './context-menu'
export { createNavHistory, pushNavHistory, goBack, goForward, canGoBack, canGoForward, type NavHistory } from './nav-history'
export { createHotkeyProcessor, matchesHotkey, processHotkeys, type HotkeyEvent, type HotkeysMap, type KeyboardShortcut, type PluginHotkeyDefinition } from './hotkeys'
export { saveTabGroups, loadTabGroups, clearTabGroups, getNextAvailableColor, ALL_COLORS, type TabGroup, type TabGroupColor } from './tab-groups'
export { targetIs, TRAIL_CLICK, type TrailClickEvent } from './route-trailer'
export { registerDesignation, registerPluginDesignations, getDesignatedPlugin, hasDesignation } from './plugin-registry'
export { registerAppExtension, getAppExtension, hasAppExtension } from './app-extensions'
export { registerPackFE, getRegisteredPlugins, getRegisteredDefaultPlugin } from './pack-store'
export type { PackFERegistration } from './pack-store'

export { useSettingsSaveStatus } from './composables/useSettingsSaveStatus'

export {
  navigateToPlugin,
  openInAppBrowser,
  useState,
} from './delegates'
