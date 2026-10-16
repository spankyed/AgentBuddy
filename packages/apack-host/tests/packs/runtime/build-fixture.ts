import * as fs from 'node:fs';
import * as path from 'node:path';
import { _declarationRevision, PACK_SNAPSHOT_FORMAT, type PackManifest } from '@apackdev/sdk/build';
import { sealPackBuild, PACK_LAYOUT, PACK_LAYOUT_VERSION, packFileHashes } from '../../../src/packs/layout.ts';

/** Finish a synthetic installed build after writing its files, exactly as staging records them. */
export function sealPack(dir: string): void {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, PACK_LAYOUT.manifest), 'utf8'));
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.integrity), JSON.stringify({
    formatVersion: PACK_LAYOUT_VERSION, id: manifest.id, version: manifest.version, files: packFileHashes(dir),
  }));
}

/** Simulate the receipt published by a fixture's completed source build. */
export function sealBuild(root: string): void {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apack.json'), 'utf8'));
  sealPackBuild(path.join(root, 'dist'), manifest);
}

/** A complete installed build for data-only consumers; executing it is a fixture failure. */
export function writeInstalledPackFixture(dir: string, manifest: PackManifest): void {
  fs.mkdirSync(path.join(dir, PACK_LAYOUT.runtimeDir), { recursive: true });
  fs.mkdirSync(path.join(dir, PACK_LAYOUT.typesDir), { recursive: true });
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.manifest), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.snapshot), JSON.stringify({
    format: PACK_SNAPSHOT_FORMAT, declarationRevision: _declarationRevision(manifest), manifest,
    types: { entities: {}, relKinds: {} }, entityDestinations: {}, facades: {},
  }));
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.runtimeEntry), 'throw new Error("Data discovery must not activate this fixture");');
  sealPack(dir);
}
