import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppEnvironment } from '@apackdev/sdk/env';
import { errorMessage } from '@apackdev/sdk/utils/pure';
import { readInstalledPacks } from '@apackdev/host/packs';
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

