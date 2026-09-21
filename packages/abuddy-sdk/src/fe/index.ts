// Types describing what a pack contributes — pack-facing, unlike the
// registration functions in ./host.

// Declares window.electronAPI; a type-only re-export survives in the emitted declarations
export type {} from './electron-api.ts';
export type { Plugin, PluginDefinition, RouteComponents } from './plugin.ts'
export type { PackFERegistration } from './pack-fe-registration.ts'
export { pasteIntoElement } from './input-paste.ts'
export { PluginScope, useApplicationActor, usePlugin } from './actor-system.ts'
export { isAnyMenuOpen, onMenuOpenChange, useTrackedMenuOpen } from './menu-state.ts'
export { getDslTypes, type DslTypeConfig } from './dsl-types.ts'
export { EXTRA_BLOCK_ITEMS_KEY, TIPTAP_PLUGINS_KEY, tiptapPluginRegistry, type BlockItem, type TiptapPlugin } from './tiptap-plugins.ts'

export { default, default as breadcrumb, breadcrumbWithParams, breadcrumbList, staticBreadcrumbList } from './breadcrumb.ts'
export { safeEvents, safeEvents as feSafeEvents, type ExtractEvent } from './safe-events.ts'
export { contextMenu, contextMenuFn, type ContextMenuItem, type ContextMenuMeta } from './context-menu.ts'
export { createNavHistory, pushNavHistory, goBack, goForward, canGoBack, canGoForward, type NavHistory } from './nav-history.ts'
export { createHotkeyProcessor, matchesHotkey, processHotkeys, type HotkeyEvent, type HotkeysMap, type KeyboardShortcut, type PluginHotkeyDefinition } from './hotkeys.ts'
export { saveTabGroups, loadTabGroups, clearTabGroups, getNextAvailableColor, ALL_COLORS, type TabGroup, type TabGroupColor } from './tab-groups.ts'
export { targetIs, TRAIL_CLICK, type TrailClickEvent } from './route-trailer.ts'
export { getDesignated, hasDesignation } from '../designations/index.ts'

export { secretsClient, type SecretsClient, type SecretsSnapshot } from './secrets-client.ts'

export {
  navigateToAddress,
  openPlugin,
  openInAppBrowser,
  type PluginEvent,
} from './navigation.ts'
