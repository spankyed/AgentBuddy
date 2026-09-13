/// <reference path="./electron-api.d.ts" />
// Types describing what a pack contributes — pack-facing, unlike the
// registration functions in ./host.
export type { Plugin, RouteComponents } from './plugin.js'
export type { PackFERegistration } from './pack-store.js'
export { pasteIntoElement } from './input-paste.js'
export { useActorSystem } from './composables/useActorSystem.js'
export { useApplicationActor } from './composables/useApplicationActor.js'
export { isAnyMenuOpen, onMenuOpenChange, useTrackedMenuOpen } from './composables/useMenuState.js'
export { useContextMenu } from './composables/useContextMenu.js'
export type { MenuItem } from './composables/useContextMenu.js'
export { useDebounce, useDebounceFn } from './composables/useDebounce.js'
export { useInfiniteScroll } from './composables/useInfiniteScroll.js'
export { useClickOutside } from './composables/useClickOutside.js'
export { useCollapsibleState } from './composables/useCollapsibleState.js'
export { useExternalFileDrag } from './composables/useExternalFileDrag.js'

export { default, default as breadcrumb, breadcrumbWithParams, breadcrumbList, staticBreadcrumbList } from './breadcrumb.js'
export { safeEvents, safeEvents as feSafeEvents, type ExtractEvent } from './safe-events.js'
export { contextMenu, contextMenuFn, type ContextMenuItem, type ContextMenuMeta } from './context-menu.js'
export { createNavHistory, pushNavHistory, goBack, goForward, canGoBack, canGoForward, type NavHistory } from './nav-history.js'
export { createHotkeyProcessor, matchesHotkey, processHotkeys, type HotkeyEvent, type HotkeysMap, type KeyboardShortcut, type PluginHotkeyDefinition } from './hotkeys.js'
export { saveTabGroups, loadTabGroups, clearTabGroups, getNextAvailableColor, ALL_COLORS, type TabGroup, type TabGroupColor } from './tab-groups.js'
export { targetIs, TRAIL_CLICK, type TrailClickEvent } from './route-trailer.js'
export { registerDesignations, getDesignated, hasDesignation } from '../designations/index.js'

export { useSettingsSaveStatus } from './composables/useSettingsSaveStatus.js'

export {
  navigateToPlugin,
  openInAppBrowser,
  useState,
} from './delegates.js'
