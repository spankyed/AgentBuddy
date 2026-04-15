import * as fs from 'fs';
import * as path from 'path';
import type { SETTINGS_SCOPE, SettingsData } from './types';
import { APP_VERSION } from '@/version';

const COMPILED_SETTINGS_PATH = path.resolve(process.cwd(), '..', 'default-setup', 'src', 'settings.json');

const loadCompiledDefaults = (): Omit<SettingsData, 'internal'> => {
  const raw = fs.readFileSync(COMPILED_SETTINGS_PATH, 'utf-8');
  return JSON.parse(raw);
};

export const getDefaultsByLabel = (type: SETTINGS_SCOPE, label: string) =>
({
  internal: defaultSettings.internal,
  general: defaultSettings.general[label as keyof typeof defaultSettings.general] ?? {},
  plugin: defaultSettings.plugins[label as keyof typeof defaultSettings.plugins] ?? {},
}[type]);

export const defaultSettings: SettingsData = {
  ...loadCompiledDefaults(),
  internal: {
    hasOnboarded: false,
    tourComplete: false,
    lastInteractionTimestamp: null,
    version: APP_VERSION,
    seedHash: null,
  },
};
