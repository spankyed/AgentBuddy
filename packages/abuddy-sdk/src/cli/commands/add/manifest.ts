import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackManifest, PackFeatureEntry } from '../../../build/manifest';

export { readManifest } from '../../utils';

export function writeManifest(root: string, manifest: PackManifest): void {
  fs.writeFileSync(path.join(root, 'abuddy.json'), JSON.stringify(manifest, null, 2) + '\n');
}

export function addFeature(manifest: PackManifest, entry: PackFeatureEntry): void {
  if (!manifest.features) manifest.features = [];
  if (manifest.features.some(f => f.id === entry.id)) {
    throw new Error(`Feature "${entry.id}" already exists in manifest`);
  }
  manifest.features.push(entry);
}

export function addStepDefinition(manifest: PackManifest, entry: { type: string; path: string; kind?: 'step' | 'trigger' }): void {
  if (!manifest.steps || typeof manifest.steps === 'string') {
    manifest.steps = { register: manifest.steps as string || 'src/extensions/steps/register.ts', definitions: [] };
  }
  if (manifest.steps.definitions.some(d => d.type === entry.type)) {
    throw new Error(`Step "${entry.type}" already exists in manifest`);
  }
  manifest.steps.definitions.push(entry);
}

export function addPackService(manifest: PackManifest, key: string, servicePath: string): void {
  if (!manifest.packServices) manifest.packServices = {};
  if (manifest.packServices[key]) {
    throw new Error(`Pack service "${key}" already exists in manifest`);
  }
  manifest.packServices[key] = servicePath;
}

export function addFeatureService(manifest: PackManifest, featureId: string, key: string, servicePath: string): void {
  const feature = manifest.features?.find(f => f.id === featureId);
  if (!feature) throw new Error(`Feature "${featureId}" not found in manifest`);
  if (!feature.services) feature.services = {};
  if (feature.services[key]) {
    throw new Error(`Service "${key}" already exists on feature "${featureId}"`);
  }
  feature.services[key] = servicePath;
}
