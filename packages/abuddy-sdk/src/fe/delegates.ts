import { getHostModule } from '../runtime/host';

let _breadcrumbMod: any;
function breadcrumbMod() {
  if (!_breadcrumbMod) _breadcrumbMod = getHostModule('breadcrumb');
  return _breadcrumbMod;
}

export function breadcrumb(...args: any[]) { return breadcrumbMod().default(...args); }
export function breadcrumbWithParams(...args: any[]) { return breadcrumbMod().breadcrumbWithParams(...args); }
export function breadcrumbList(...args: any[]) { return breadcrumbMod().breadcrumbList(...args); }

let _safeEventsMod: any;
function safeEventsMod() {
  if (!_safeEventsMod) _safeEventsMod = getHostModule('fe-safe-events');
  return _safeEventsMod;
}

export function feSafeEvents(...args: any[]) { return safeEventsMod().safeEvents(...args); }

let _routeTrailerMod: any;
function routeTrailerMod() {
  if (!_routeTrailerMod) _routeTrailerMod = getHostModule('route-trailer');
  return _routeTrailerMod;
}

export function targetIs(...args: any[]) { return routeTrailerMod().targetIs(...args); }
export function getTrailClick() { return routeTrailerMod().TRAIL_CLICK; }
export const TRAIL_CLICK: string = 'TRAIL_CLICK';
export type TrailClickEvent = any;

let _contextMenuMod: any;
function contextMenuMod() {
  if (!_contextMenuMod) _contextMenuMod = getHostModule('context-menu');
  return _contextMenuMod;
}

export function contextMenuFn(...args: any[]) { return contextMenuMod().contextMenuFn(...args); }
export function contextMenu(...args: any[]) { return contextMenuMod().contextMenu(...args); }

let _navigateMod: any;
function navigateMod() {
  if (!_navigateMod) _navigateMod = getHostModule('navigate');
  return _navigateMod;
}

export function navigateToPlugin(...args: any[]) { return navigateMod().navigateToPlugin(...args); }

let _navHistoryMod: any;
function navHistoryMod() {
  if (!_navHistoryMod) _navHistoryMod = getHostModule('nav-history');
  return _navHistoryMod;
}

export function createNavHistory(...args: any[]) { return navHistoryMod().createNavHistory(...args); }
export function pushNavHistory(...args: any[]) { return navHistoryMod().pushNavHistory(...args); }
export function goBack(...args: any[]) { return navHistoryMod().goBack(...args); }
export function goForward(...args: any[]) { return navHistoryMod().goForward(...args); }
export function canGoBack(...args: any[]) { return navHistoryMod().canGoBack(...args); }
export function canGoForward(...args: any[]) { return navHistoryMod().canGoForward(...args); }
export type NavHistory = any;

let _hotkeysMod: any;
function hotkeysMod() {
  if (!_hotkeysMod) _hotkeysMod = getHostModule('hotkeys');
  return _hotkeysMod;
}

export function createHotkeyProcessor(...args: any[]) { return hotkeysMod().createHotkeyProcessor(...args); }
export type HotkeyEvent = any;
export type HotkeysMap = any;

let _tabGroupsMod: any;
function tabGroupsMod() {
  if (!_tabGroupsMod) _tabGroupsMod = getHostModule('tab-groups');
  return _tabGroupsMod;
}

export function saveTabGroups(...args: any[]) { return tabGroupsMod().saveTabGroups(...args); }
export function loadTabGroups(...args: any[]) { return tabGroupsMod().loadTabGroups(...args); }
export function clearTabGroups(...args: any[]) { return tabGroupsMod().clearTabGroups(...args); }
export function getNextAvailableColor(...args: any[]) { return tabGroupsMod().getNextAvailableColor(...args); }
export function getAllColors() { return tabGroupsMod().ALL_COLORS; }
export const ALL_COLORS: any = new Proxy([] as any, {
  get(_, prop) {
    if (prop === Symbol.iterator || prop === 'length') {
      return tabGroupsMod().ALL_COLORS[prop];
    }
    return tabGroupsMod().ALL_COLORS[prop];
  }
});
export type TabGroup = any;
export type TabGroupColor = any;

let _openBrowserMod: any;
function openBrowserMod() {
  if (!_openBrowserMod) _openBrowserMod = getHostModule('open-in-app-browser');
  return _openBrowserMod;
}

export function openInAppBrowser(...args: any[]) { return openBrowserMod().openInAppBrowser(...args); }

let _settingsSaveStatusMod: any;
function settingsSaveStatusMod() {
  if (!_settingsSaveStatusMod) _settingsSaveStatusMod = getHostModule('settings-save-status');
  return _settingsSaveStatusMod;
}

export function useSettingsSaveStatus(...args: any[]) { return settingsSaveStatusMod().useSettingsSaveStatus(...args); }

let _pluginsMod: any;
function pluginsMod() {
  if (!_pluginsMod) _pluginsMod = getHostModule('plugins');
  return _pluginsMod;
}

export function useState(...args: any[]) { return pluginsMod().useState(...args); }
