// What this pack contributes to the app's settings: the sections it owns, with their defaults, and the help it
// answers with. The help comes from this pack's compiled seeds, so it is read the first time the app asks
// rather than at registration; the base settings are this pack's own source, imported directly.
import { seedPath } from '@abuddy/sdk/build';
import { getCompiledDir } from '#generated/seeders.ts';
import { loadJSON } from '@abuddy/sdk/utils';
import { isPlainObject } from '@abuddy/sdk/utils/pure';
import type { HelpEntry } from '@abuddy/sdk/framework';
import type { SettingsData } from './types.ts';
import baseSettings from '../seeds/default-settings.ts';

/**
 * The base settings this pack contributes: its `general` and `assistant` sections, with no plugin's slice.
 *
 * **An import, because this is this pack's own source.** It used to be a `boot.seed` entry: compiled to
 * `settings.seed.json`, written to disk, and read back here with `readFileSync` — a round trip whose only
 * consumer was the pack that wrote it, and whose cost was a "run `npm run compile` first" error for anyone
 * who had not paid it. `boot.seed` is for entries that import rows into the database, and this never did:
 * the settings row holds only what the user changed, and the store composes these defaults underneath it
 * from the registration.
 *
 * The compiler's one check comes with it, since that is a claim about this file rather than about compiling:
 * a feature declares its own settings, and whether its tab shows, in `features[].settings`.
 */
export function getBaseSettings(): SettingsData {
  assertNoPluginSlice(baseSettings, 'src/seeds/default-settings.ts');
  return baseSettings;
}

/**
 * Refuses base settings that set a plugin's slice, including the app shell's old `_meta`.
 *
 * A function rather than two lines inside the getter, because the getter reads a static import and a spec has
 * no way to hand it a bad one: the claim is about any base file, so it is checked where it can be asked.
 */
export function assertNoPluginSlice(settings: unknown, source: string): void {
  const plugins = isPlainObject(settings) ? (settings as { plugins?: unknown }).plugins : undefined;
  if (isPlainObject(plugins) && Object.keys(plugins).length > 0) {
    throw new Error(`${source} sets a plugin's settings: a feature declares its own, and whether its tab `
      + 'shows, in features[].settings');
  }
}

/** The sections this pack owns, which the app merges under the user's changes */
export function settingsSections(): Record<string, unknown> {
  const { general, assistant } = getBaseSettings();
  return { general, assistant };
}

/** This pack's help entries, listed under Help in the app's Settings view */
export function helpEntries(): HelpEntry[] {
  return loadJSON<{ records: HelpEntry[] }>(seedPath(getCompiledDir(), 'faqs'))?.records ?? [];
}
