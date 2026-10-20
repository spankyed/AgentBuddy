import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppEnvironment } from '@apackdev/sdk/env';
import { errorMessage } from '@apackdev/sdk/utils/pure';
import { readInstalledPacks, writeInstalledPacks, type PackRecord } from '@apackdev/host/packs';
import { readValidManifest } from '../utils';

export function packInventory(context: Pick<AppEnvironment, 'packsDir' | 'installedPacksFile'>) {
  const records = new Map(readInstalledPacks(context.installedPacksFile, { strict: true }).map(record => [record.id, record]));
  if (!fs.existsSync(context.packsDir)) return [];
  return fs.readdirSync(context.packsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => {
      const dir = path.join(context.packsDir, entry.name);
      try {
        const manifest = readValidManifest(dir);
        if (manifest.id !== entry.name) throw new Error(`Directory name does not match manifest id ${manifest.id}`);
        return { manifest, dir, record: records.get(manifest.id) ?? { id: manifest.id, enabled: true } };
      } catch (error) {
        throw new Error(`Cannot read installed pack ${dir}: ${errorMessage(error)}`);
      }
    });
}

/** Persist a CLI install's source without changing another profile's records. */
export function recordCliInstall(file: string, id: string, installedFrom?: string): void {
  const records = readInstalledPacks(file, { strict: true });
  const old = records.find(record => record.id === id);
  const next: PackRecord = {
    id, enabled: old?.suppressAppInstall ? true : old?.enabled ?? true, updatesWith: 'user', installedAt: old?.installedAt ?? new Date().toISOString(),
    ...(installedFrom !== undefined && { installedFrom }),
    ...(old?.lastError !== undefined && { lastError: old.lastError }),
  };
  if (!writeInstalledPacks([...records.filter(record => record.id !== id), next], file)) {
    throw new Error(`Pack files were installed, but recording their source failed: ${file}`);
  }
}
