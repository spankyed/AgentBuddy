import * as fs from 'fs';
import * as path from 'path';
import type { SETTINGS_SCOPE, SettingsData } from './types';
import { APP_VERSION } from '@/version';

const SETTINGS_PATH = path.resolve(process.cwd(), '..', 'default-setup', 'dist', 'compiled-settings.json');

const loadDefaults = (): SettingsData => {
  let settings: SettingsData;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch (err) {
    throw new Error(
      `Missing or unreadable ${path.basename(SETTINGS_PATH)} at ${SETTINGS_PATH}. ` +
      `Run \`npm run compile:settings\` before starting the backend. (${(err as Error).message})`
    );
  }
  // Merge rather than dereference — defensive if a future edit drops `internal` from the JSON
  settings.internal = { ...(settings.internal ?? {} as SettingsData['internal']), version: APP_VERSION };
  return settings;
};

export const getDefaultsByLabel = (type: SETTINGS_SCOPE, label: string) =>
({
  internal: defaultSettings.internal,
  general: defaultSettings.general[label as keyof typeof defaultSettings.general] ?? {},
  plugin: defaultSettings.plugins[label as keyof typeof defaultSettings.plugins] ?? {},
}[type]);

export const defaultSettings: SettingsData = loadDefaults();
