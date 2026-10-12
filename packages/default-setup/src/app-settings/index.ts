// What this pack contributes to the app's settings: the sections it owns, with their defaults, and the help it
// answers with. The help comes from this pack's compiled content, so it is read the first time the app asks
// rather than at registration; the base settings are this pack's own source, imported directly.
import { isPlainObject } from '@apackdev/sdk/utils/pure';
import type { SettingsData } from './types.ts';
import baseSettings from '../content/default-settings.ts';

/**
 * The base settings this pack contributes: its `general` and `assistant` sections, with no feature's slice.
 *
 * **An import, because this is this pack's own source, and not a content entry.** `content.sources` is for entries
 * that import rows into the database, and these are never written to one: the settings row holds only what
 * the user changed, and the store composes these defaults underneath it from this pack's registration. A
 * pack compiling its own content to disk only to read it back needs the build to have run before the app
 * can start, which is the cost an import avoids.
 *
 * `assertNoFeatureSlice` travels with it, being a claim about this file rather than about compiling: a
 * feature declares its own settings, and whether its tab shows, in `features[].settings`.
 */
export function getBaseSettings(): SettingsData {
  assertNoFeatureSlice(baseSettings, 'src/content/default-settings.ts');
  return baseSettings;
}

/**
 * Refuses base settings that set a feature's slice, including the app shell's old `_meta`.
 *
 * A function rather than two lines inside the getter, because the getter reads a static import and a spec has
 * no way to hand it a bad one: the claim is about any base file, so it is checked where it can be asked.
 */
export function assertNoFeatureSlice(settings: unknown, source: string): void {
  const features = isPlainObject(settings) ? (settings as { features?: unknown }).features : undefined;
  if (isPlainObject(features) && Object.keys(features).length > 0) {
    throw new Error(`${source} sets a feature's settings: declare values in features.<id>.settings; `
      + 'navigation defaults belong in features.<id>.plugin.defaultVisible');
  }
}

/** The sections this pack owns, which the app merges under the user's changes */
export function settingsSections(): Record<string, unknown> {
  const { general, assistant } = getBaseSettings();
  return { general, assistant };
}
