import * as fs from 'fs';
import * as path from 'path';
import type { PackSnapshot, PackTypeManifest, PackManifest } from '@abuddy/sdk/build';

const root = path.resolve(import.meta.dirname, '..');
const defsDir = path.join(root, 'defs');
const distDir = path.join(root, 'dist');

const manifest: PackManifest = JSON.parse(fs.readFileSync(path.join(root, 'abuddy.json'), 'utf-8'));

const defs: Record<string, string> = {};
for (const file of fs.readdirSync(defsDir)) {
  if (!file.endsWith('.d.ts')) continue;
  const key = file.replace(/\.d\.ts$/, '');
  defs[key] = fs.readFileSync(path.join(defsDir, file), 'utf-8');
}

const types: PackTypeManifest = {
  entities: manifest.entities ?? {},
  relKinds: manifest.relKinds ?? {},
};

const snapshot: PackSnapshot = { types, defs, manifest };

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2));

console.log(`Snapshot written to dist/snapshot.json`);
console.log(`  ${Object.keys(defs).length} def(s): ${Object.keys(defs).join(', ')}`);
console.log(`  ${Object.keys(types.entities).length} entity type(s), ${Object.keys(types.relKinds).length} relation kind(s)`);
