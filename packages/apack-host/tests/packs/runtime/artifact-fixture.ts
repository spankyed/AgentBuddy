import * as fs from 'node:fs';
import * as path from 'node:path';
import { PACK_LAYOUT, PACK_LAYOUT_VERSION, packFileHashes } from '../../../src/packs/layout.ts';

/** Finish a synthetic installed build after writing its files, exactly as staging records them. */
export function sealPack(dir: string): void {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, PACK_LAYOUT.manifest), 'utf8'));
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.integrity), JSON.stringify({
    formatVersion: PACK_LAYOUT_VERSION, id: manifest.id, version: manifest.version, files: packFileHashes(dir),
  }));
}
