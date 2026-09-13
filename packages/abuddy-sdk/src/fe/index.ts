/// <reference path="./electron-api.d.ts" />
// Types describing what a pack contributes — pack-facing, unlike the
// registration functions in ./host.
export type { Plugin, RouteComponents } from './plugin.js'
export type { PackFERegistration } from './pack-store.js'
export { pasteIntoElement } from './input-paste.js'
export { useActorSystem, useApplicationActor } from './actor-system.js'
export { isAnyMenuOpen, onMenuOpenChange, useTrackedMenuOpen } from './menu-state.js'
export { registerDslType, getDslTypes, type DslTypeConfig } from './dsl-types.js'
export { EXTRA_BLOCK_ITEMS_KEY, TIPTAP_PLUGINS_KEY, getTiptapPlugins, type BlockItem, type TiptapPlugin } from './tiptap-plugins.js'

export { default, default as breadcrumb, breadcrumbWithParams, breadcrumbList, staticBreadcrumbList } from './breadcrumb.js'
export { safeEvents, safeEvents as feSafeEvents, type ExtractEvent } from './safe-events.js'
export { contextMenu, contextMenuFn, type ContextMenuItem, type ContextMenuMeta } from './context-menu.js'
export { createNavHistory, pushNavHistory, goBack, goForward, canGoBack, canGoForward, type NavHistory } from './nav-history.js'
export { createHotkeyProcessor, matchesHotkey, processHotkeys, type HotkeyEvent, type HotkeysMap, type KeyboardShortcut, type PluginHotkeyDefinition } from './hotkeys.js'
export { saveTabGroups, loadTabGroups, clearTabGroups, getNextAvailableColor, ALL_COLORS, type TabGroup, type TabGroupColor } from './tab-groups.js'
export { targetIs, TRAIL_CLICK, type TrailClickEvent } from './route-trailer.js'
export { registerDesignations, getDesignated, hasDesignation } from '../designations/index.js'

export { useSettingsSaveStatus } from './settings-save-status.js'

export {
  navigateToPlugin,
  openInAppBrowser,
  useState,
} from './delegates.js'
