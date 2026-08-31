import * as fs from 'fs';
import * as path from 'path';
import type { SETTINGS_SCOPE, SettingsData } from './types';
import { getAppVersion } from '@abuddy/sdk/utils';

const SETTINGS_PATH = path.resolve(process.cwd(), '..', 'default-setup', 'dist', 'compiled-settings.json');

const loadJson = (): SettingsData => {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch (err) {
    throw new Error(
      `Missing or unreadable ${path.basename(SETTINGS_PATH)} at ${SETTINGS_PATH}. ` +
      `Run \`npm run compile:settings\` before starting the backend. (${(err as Error).message})`
    );
  }
};

const baseSettings = loadJson();
let _resolved: SettingsData | null = null;

export function getDefaultSettings(): SettingsData {
  if (!_resolved) {
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
