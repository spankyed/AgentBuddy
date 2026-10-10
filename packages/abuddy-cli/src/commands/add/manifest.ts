import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackManifest, PackFeatureEntry, StepEntry } from '@abuddy/sdk/build';

export { readManifest } from '../../utils';

export function writeManifest(root: string, manifest: PackManifest): void {
  fs.writeFileSync(path.join(root, 'abuddy.json'), JSON.stringify(manifest, null, 2) + '\n');
}

export function addFeature(manifest: PackManifest, id: string, entry: PackFeatureEntry): void {
  if (!manifest.features) manifest.features = {};
  if (manifest.features[id]) throw new Error(`Feature "${id}" already exists in manifest`);
  manifest.features[id] = entry;
}

/** Adds a flow step: `entry` names where each of its facets lives */
export function addStep(manifest: PackManifest, type: string, entry: StepEntry): void {
  if (!manifest.steps) manifest.steps = {};
  if (manifest.steps[type]) throw new Error(`Step "${type}" already exists in manifest`);
  manifest.steps[type] = entry;
}

/** Adds an artifact type: `icon` is a lucide-vue-next export name, `component` the path to its viewer */
export function addArtifact(
  manifest: PackManifest,
  type: string,
  entry: { icon: string; component: string },
): void {
  if (!manifest.artifacts) manifest.artifacts = {};
  if (manifest.artifacts[type]) throw new Error(`Artifact "${type}" already exists in manifest`);
  manifest.artifacts[type] = { icon: entry.icon, fe: entry.component };
}

/** Adds a message block: `component` is the path to the `.vue` file that draws it */
export function addBlock(
  manifest: PackManifest,
  type: string,
  entry: { kind?: 'input'; component: string },
): void {
  if (!manifest.blocks) manifest.blocks = {};
  if (manifest.blocks[type]) throw new Error(`Block "${type}" already exists in manifest`);
  manifest.blocks[type] = { ...(entry.kind ? { kind: entry.kind } : {}), fe: entry.component };
}

/** Adds a pack-level service: `target` is "path#exportName" of the service object */
export function addPackService(manifest: PackManifest, key: string, target: string): void {
  if (!manifest.packServices) manifest.packServices = {};
  if (manifest.packServices[key]) {
    throw new Error(`Pack service "${key}" already exists in manifest`);
  }
  manifest.packServices[key] = target;
}

/** Adds a feature service: `target` is "path#exportName" of the service object */
export function addFeatureService(manifest: PackManifest, featureId: string, key: string, target: string): void {
  const feature = manifest.features?.[featureId];
  if (!feature) throw new Error(`Feature "${featureId}" not found in manifest`);
  if (!feature.services) feature.services = {};
  if (feature.services[key]) {
    throw new Error(`Service "${key}" already exists on feature "${featureId}"`);
  }
  feature.services[key] = target;
}
