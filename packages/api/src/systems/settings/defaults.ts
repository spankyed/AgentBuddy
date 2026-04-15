import * as fs from 'fs';
import * as path from 'path';
import type { SETTINGS_SCOPE, SettingsData } from './types';
import { APP_VERSION } from '@/version';

const SETTINGS_PATH = path.resolve(process.cwd(), '..', 'default-setup', 'src', 'settings.json');

const loadDefaults = (): SettingsData => {
  const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
  const settings = JSON.parse(raw) as SettingsData;
  settings.internal.version = APP_VERSION;
  return settings;
};

export const getDefaultsByLabel = (type: SETTINGS_SCOPE, label: string) =>
({
  internal: defaultSettings.internal,
  general: defaultSettings.general[label as keyof typeof defaultSettings.general] ?? {},
  plugin: defaultSettings.plugins[label as keyof typeof defaultSettings.plugins] ?? {},
}[type]);

export const defaultSettings: SettingsData = loadDefaults();
