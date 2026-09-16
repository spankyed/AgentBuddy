import * as fs from 'fs';
import type { SettingsData } from './types';
import { getAppVersion } from '@abuddy/sdk/utils';
import { seedFile, seedPath } from '@abuddy/sdk/build';
import { getCompiledDir } from '@/__generated__/seeders';
import { getPackSettingsDefaults, type PackSettingsDefaults } from '@abuddy/sdk/framework';

let _base: SettingsData | null = null;
let _resolved: { revision: number; data: SettingsData } | null = null;

/** The app's defaults with registered packs' feature settings added; the app's own win */
function withPackDefaults(base: SettingsData, packs: PackSettingsDefaults['settings']): SettingsData {
  const { _meta: packMeta, ...packPlugins } = packs.plugins;
  const baseMeta = base.plugins._meta ?? {};
  return {
    ...base,
    plugins: {
      ...packPlugins,
      ...base.plugins,
      _meta: { ...baseMeta, visibility: { ...packMeta?.visibility, ...baseMeta.visibility } },
    },
  };
}

export function getDefaultSettings(): SettingsData {
  const packs = getPackSettingsDefaults();
  if (_resolved?.revision !== packs.revision) {
    _resolved = { revision: packs.revision, data: withPackDefaults(getBaseSettings(), packs.settings) };
  }
  return _resolved.data;
}

function getBaseSettings(): SettingsData {
  if (!_base) {
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
    _base = { ...baseSettings };
    _base.internal = { ...(baseSettings.internal ?? {} as SettingsData['internal']), version: getAppVersion() };
  }
  return _base;
}
