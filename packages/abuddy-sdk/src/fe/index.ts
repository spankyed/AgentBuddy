/// <reference path="./electron-api.d.ts" />
// Types describing what a pack contributes — pack-facing, unlike the
// registration functions in ./host.
export type { Plugin, RouteComponents } from './plugin.ts'
export type { PackFERegistration } from './pack-fe-registration.ts'
export { pasteIntoElement } from './input-paste.ts'
export { useActorSystem, useApplicationActor } from './actor-system.ts'
export { isAnyMenuOpen, onMenuOpenChange, useTrackedMenuOpen } from './menu-state.ts'
export { registerDslType, getDslTypes, type DslTypeConfig } from './dsl-types.ts'
export { EXTRA_BLOCK_ITEMS_KEY, TIPTAP_PLUGINS_KEY, tiptapPluginRegistry, type BlockItem, type TiptapPlugin } from './tiptap-plugins.ts'

export { default, default as breadcrumb, breadcrumbWithParams, breadcrumbList, staticBreadcrumbList } from './breadcrumb.ts'
export { safeEvents, safeEvents as feSafeEvents, type ExtractEvent } from './safe-events.ts'
export { contextMenu, contextMenuFn, type ContextMenuItem, type ContextMenuMeta } from './context-menu.ts'
export { createNavHistory, pushNavHistory, goBack, goForward, canGoBack, canGoForward, type NavHistory } from './nav-history.ts'
export { createHotkeyProcessor, matchesHotkey, processHotkeys, type HotkeyEvent, type HotkeysMap, type KeyboardShortcut, type PluginHotkeyDefinition } from './hotkeys.ts'
export { saveTabGroups, loadTabGroups, clearTabGroups, getNextAvailableColor, ALL_COLORS, type TabGroup, type TabGroupColor } from './tab-groups.ts'
export { targetIs, TRAIL_CLICK, type TrailClickEvent } from './route-trailer.ts'
export { registerDesignations, getDesignated, hasDesignation } from '../designations/index.ts'

export { useSettingsSaveStatus } from './settings-save-status.ts'

export {
  navigateToPlugin,
  openInAppBrowser,
  useState,
} from './delegates.ts'
