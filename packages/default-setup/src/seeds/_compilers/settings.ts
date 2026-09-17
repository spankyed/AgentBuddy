// Compiles the `settings` seed entry in abuddy.json: the default settings (src/seeds/default-settings.ts) with each
// feature's settings (features[].settings) merged over them, as one record. The settings seeder
// (../settings/seeder.ts) seeds it by resetting the user's settings, and the settings repository reads it as the
// defaults (features/settings/be/defaults.ts).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SeedCompileContext, SeedRecord } from '@abuddy/sdk/build';
import { mergeSettings } from '../../features/settings/merge-settings';

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

export default async function compileSettings({ path: sourcePath, packDir }: SeedCompileContext): Promise<SettingsSeedRecord[]> {
  const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'abuddy.json'), 'utf-8')) as { features?: Array<{ settings?: string }> };
  let settings = await defaultExport(sourcePath);
  for (const feature of manifest.features ?? []) {
    const file = feature.settings && path.resolve(packDir, feature.settings);
    if (file && fs.existsSync(file)) settings = mergeSettings(settings, await defaultExport(file));
  }
  return [{ name: 'default-settings', description: 'Application defaults', settings }];
}
