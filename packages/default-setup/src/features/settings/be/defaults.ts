import * as fs from 'fs';
import type { SETTINGS_SCOPE, SettingsData } from './types';
import { getAppVersion } from '@abuddy/sdk/utils';
import { seedFile, seedPath } from '@abuddy/sdk/build';
import { getCompiledDir } from '@/__generated__/seeders';

let _resolved: SettingsData | null = null;

export function getDefaultSettings(): SettingsData {
  if (!_resolved) {
    const settingsPath = seedPath(getCompiledDir(), 'settings');
    let baseSettings: SettingsData;
    try {
      baseSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (err) {
      throw new Error(
        `Missing or unreadable ${seedFile('settings')} at ${settingsPath}. ` +
        `Run \`npm run compile:settings\` before starting the backend. (${(err as Error).message})`
      );
    }
    _resolved = { ...baseSettings };
    _resolved.internal = { ...(baseSettings.internal ?? {} as SettingsData['internal']), version: getAppVersion() };
  }
  return _resolved;
}

export const getDefaultsByLabel = (type: SETTINGS_SCOPE, label: string) => {
  const ds = getDefaultSettings();
  return {
    internal: ds.internal,
    general: ds.general[label as keyof typeof ds.general] ?? {},
    plugin: ds.plugins[label as keyof typeof ds.plugins] ?? {},
  }[type];
};
