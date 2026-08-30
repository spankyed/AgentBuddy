import { getHostModule } from '../runtime/host';

// --- Navigate ---
let _navigateMod: any;
function navigateMod() {
  if (!_navigateMod) _navigateMod = getHostModule('navigate');
  return _navigateMod;
}

export function navigateToPlugin(...args: any[]): void {
  return navigateMod().navigateToPlugin(...args);
}

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
