import type { SettingsValidator } from './settings-definition.ts';
import { boundHost } from '../runtime/host-runtime.ts';
import type { FeatureRef } from '../ids/index.ts';

/** Registered feature defaults and validators, keyed by ref, plus pack-owned sections. Backend-only. */
export interface PackSettingsDefaults {
  revision: number;
  settings: { features: Record<string, unknown>; [section: string]: unknown };
  validators: Record<string, SettingsValidator>;
  visibility: Record<string, boolean>;
}

/** The default settings registered packs' features declare (the bound app's registered packs) */
export function getPackSettingsDefaults(): PackSettingsDefaults {
  return boundHost().packs.settingsDefaults();
}

/** Calls `listener` whenever a pack's feature settings are registered or unregistered; returns the unsubscribe */
export function onPackSettingsDefaultsChanged(listener: () => void): () => void {
  return boundHost().packs.onSettingsDefaultsChanged(listener);
}

/**
 * The refs of every installed feature that can have settings, a disabled pack's included (the bound app's): it declares
 * a settings declaration. A feature's settings may be written only under one of
 * them; the settings of a pack since uninstalled stay while nothing changes them.
 */
export function getFeaturesWithSettings(): readonly FeatureRef[] {
  return boundHost().packs.featuresWithSettings();
}
