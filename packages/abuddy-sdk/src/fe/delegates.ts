import { getHostModule } from '../runtime/host';

// --- Breadcrumb ---
let _breadcrumbMod: any;
function breadcrumbMod() {
  if (!_breadcrumbMod) _breadcrumbMod = getHostModule('breadcrumb');
  return _breadcrumbMod;
}

export function breadcrumb(target: string, label: string, isDefault?: boolean): {
  breadcrumb: { label: string; target: string; default: boolean };
} {
  return breadcrumbMod().default(target, label, isDefault);
}

export function breadcrumbWithParams<C>(opts: {
  target: string;
} & (
  | { getLabel: (ctx: C) => string; prefix?: never; paramName?: never }
  | { getLabel?: never; prefix?: string; paramName: keyof C }
)): { readonly breadcrumb: (ctx: C) => { label: string; target: string } } {
  return breadcrumbMod().breadcrumbWithParams(opts);
}

export function breadcrumbList<C>(
  getCrumbs: (ctx: C) => Array<{ label: string; target: string; info?: any }>
): { readonly breadcrumb: (ctx: C) => Array<{ label: string; target: string; info?: any }> } {
  return breadcrumbMod().breadcrumbList(getCrumbs);
}

export function staticBreadcrumbList(
  crumbs: Array<{ label: string; target: string; info?: any }>
): { readonly breadcrumb: Array<{ label: string; target: string; info?: any }> } {
  return breadcrumbMod().staticBreadcrumbList(crumbs);
}

// --- FE Safe Events ---
let _safeEventsMod: any;
function safeEventsMod() {
  if (!_safeEventsMod) _safeEventsMod = getHostModule('fe-safe-events');
  return _safeEventsMod;
}

export function feSafeEvents<T extends { type: string }>(): {
  [K in T['type']]: K;
} {
  return safeEventsMod().safeEvents();
}

// --- Route Trailer ---
let _routeTrailerMod: any;
function routeTrailerMod() {
  if (!_routeTrailerMod) _routeTrailerMod = getHostModule('route-trailer');
  return _routeTrailerMod;
}

export const targetIs: any = (...args: any[]) => routeTrailerMod().targetIs(...args);

export function getTrailClick(): string { return routeTrailerMod().TRAIL_CLICK; }
export const TRAIL_CLICK: string = 'TRAIL_CLICK';
export type TrailClickEvent = { type: 'TRAIL_CLICK'; target: string; info?: any };

// --- Context Menu ---
let _contextMenuMod: any;
function contextMenuMod() {
  if (!_contextMenuMod) _contextMenuMod = getHostModule('context-menu');
  return _contextMenuMod;
}

export interface ContextMenuItem {
  label: string;
  icon?: any;
  iconColor?: string;
  event: { type: string; [key: string]: any };
  separator?: boolean;
  isActive?: boolean;
  confirm?: string;
}

export function contextMenuFn<C>(getItems: (ctx: C) => ContextMenuItem[]): {
  readonly contextMenu: (ctx: C) => ContextMenuItem[];
} {
  return contextMenuMod().contextMenuFn(getItems);
}

export function contextMenu(items: ContextMenuItem[]): { contextMenu: ContextMenuItem[] } {
  return contextMenuMod().contextMenu(items);
}

// --- Navigate ---
let _navigateMod: any;
function navigateMod() {
  if (!_navigateMod) _navigateMod = getHostModule('navigate');
  return _navigateMod;
}

export function navigateToPlugin(...args: any[]): void {
  return navigateMod().navigateToPlugin(...args);
}

// --- Nav History ---
let _navHistoryMod: any;
function navHistoryMod() {
  if (!_navHistoryMod) _navHistoryMod = getHostModule('nav-history');
  return _navHistoryMod;
}

export interface NavHistory {
  entry: any;
  history: any[];
  [key: string]: any;
}

export function createNavHistory<T = string>(initialView?: T): NavHistory { return navHistoryMod().createNavHistory(initialView); }
export function pushNavHistory(history: NavHistory, target: string, info?: any): NavHistory {
  return navHistoryMod().pushNavHistory(history, target, info);
}
export function goBack(history: NavHistory): NavHistory { return navHistoryMod().goBack(history); }
export function goForward(history: NavHistory): NavHistory { return navHistoryMod().goForward(history); }
export function canGoBack(history: NavHistory): boolean { return navHistoryMod().canGoBack(history); }
export function canGoForward(history: NavHistory): boolean { return navHistoryMod().canGoForward(history); }

// --- Hotkeys ---
let _hotkeysMod: any;
function hotkeysMod() {
  if (!_hotkeysMod) _hotkeysMod = getHostModule('hotkeys');
  return _hotkeysMod;
}

export type HotkeyEvent = any;
export type HotkeysMap = any;

export function createHotkeyProcessor(...args: any[]): any {
  return hotkeysMod().createHotkeyProcessor(...args);
}

// --- Tab Groups ---
let _tabGroupsMod: any;
function tabGroupsMod() {
  if (!_tabGroupsMod) _tabGroupsMod = getHostModule('tab-groups');
  return _tabGroupsMod;
}

export type TabGroup = any;

export type TabGroupColor = string;

export function saveTabGroups(pluginId: string, groups: TabGroup[]): void { return tabGroupsMod().saveTabGroups(pluginId, groups); }
export function loadTabGroups(pluginId: string): TabGroup[] { return tabGroupsMod().loadTabGroups(pluginId); }
export function clearTabGroups(pluginId: string): void { return tabGroupsMod().clearTabGroups(pluginId); }
export function getNextAvailableColor(...args: any[]): string { return tabGroupsMod().getNextAvailableColor(...args); }
export function getAllColors(): TabGroupColor[] { return tabGroupsMod().ALL_COLORS; }
export const ALL_COLORS: any = new Proxy([] as any, {
  get(_, prop) {
    if (prop === Symbol.iterator || prop === 'length') {
      return tabGroupsMod().ALL_COLORS[prop];
    }
    return tabGroupsMod().ALL_COLORS[prop];
  }
});

// --- Open in App Browser ---
let _openBrowserMod: any;
function openBrowserMod() {
  if (!_openBrowserMod) _openBrowserMod = getHostModule('open-in-app-browser');
  return _openBrowserMod;
}

export function openInAppBrowser(url: string): void { return openBrowserMod().openInAppBrowser(url); }

// --- Settings Save Status ---
let _settingsSaveStatusMod: any;
function settingsSaveStatusMod() {
  if (!_settingsSaveStatusMod) _settingsSaveStatusMod = getHostModule('settings-save-status');
  return _settingsSaveStatusMod;
}

export function useSettingsSaveStatus(...args: any[]): any { return settingsSaveStatusMod().useSettingsSaveStatus(...args); }

// --- Plugins ---
let _pluginsMod: any;
function pluginsMod() {
  if (!_pluginsMod) _pluginsMod = getHostModule('plugins');
  return _pluginsMod;
}

export function useState(...args: any[]): any { return pluginsMod().useState(...args); }
