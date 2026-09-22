// Compiles the `settings` seed entry in abuddy.json: the app's default settings (src/seeds/default-settings.ts),
// as one record. The settings seeder (../settings/seeder.ts) seeds it by resetting the user's settings, and the
// settings repository reads it as the defaults (features/settings/be/defaults.ts). A feature's own settings
// (features[].settings) aren't in it: the pack registry holds them, under each plugin's ref, for every pack.
import { pathToFileURL } from 'node:url';
import type { SeedCompileContext, SeedRecord } from '@abuddy/sdk/build';

/** The record the settings seed holds */
export interface SettingsSeedRecord extends SeedRecord {
  name: 'default-settings';
  settings: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

async function defaultExport(file: string): Promise<Record<string, unknown>> {
  const mod = await import(pathToFileURL(file).href) as { default?: unknown };
  if (!isRecord(mod.default)) throw new Error(`${file} has no default export of a settings object`);
  return mod.default;
}

export default async function compileSettings({ path: sourcePath }: SeedCompileContext): Promise<SettingsSeedRecord[]> {
  const settings = await defaultExport(sourcePath);
  if (isRecord(settings.plugins) && Object.keys(settings.plugins).length > 0) {
    throw new Error(`${sourcePath} sets a plugin's settings: a feature declares its own, and whether its tab shows, in features[].settings`);
  }
  return [{ name: 'default-settings', description: 'Application defaults', settings }];
}
