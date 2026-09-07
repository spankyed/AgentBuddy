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

// --- Plugins ---
let _pluginsMod: any;
function pluginsMod() {
  if (!_pluginsMod) _pluginsMod = getHostModule('plugins');
  return _pluginsMod;
}

export function useState(...args: any[]): any { return pluginsMod().useState(...args); }
