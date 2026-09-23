// What this pack contributes to the app's settings: the sections it owns, with their defaults, and the help it
// answers with. Both are read the first time the app reads them rather than at registration, because both come
// from this pack's compiled seeds, which exist only after `abuddy build`.
import * as fs from 'fs';
import { seedFile, seedPath } from '@abuddy/sdk/build';
import { getCompiledDir } from '@/__generated__/seeders';
import { loadJSON } from '@abuddy/sdk/utils';
import type { HelpEntry } from '@abuddy/sdk/framework';
import type { SettingsData } from './types';
import type { SettingsSeedRecord } from '../seeds/_compilers/settings';

let base: SettingsData | null = null;

/** The base settings this pack seeds: its `general` and `assistant` sections, with no plugin's slice */
export function getBaseSettings(): SettingsData {
  if (!base) {
    const settingsPath = seedPath(getCompiledDir(), 'settings');
    let record: SettingsSeedRecord | undefined;
    try {
      record = (JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { records?: SettingsSeedRecord[] }).records?.[0];
    } catch (err) {
      throw new Error(
        `Missing or unreadable ${seedFile('settings')} at ${settingsPath}. ` +
        `Run \`npm run compile\` before starting the backend. (${(err as Error).message})`
      );
    }
    if (!record) throw new Error(`${settingsPath} holds no settings record. Run \`npm run compile\` before starting the backend.`);
    base = record.settings as unknown as SettingsData;
  }
  return base;
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
