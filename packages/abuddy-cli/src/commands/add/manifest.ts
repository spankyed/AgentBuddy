import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackManifest, PackFeatureEntry, StepEntry, MigrationLine } from '@abuddy/sdk/build';

export { readManifest } from '../../utils';

export function writeManifest(root: string, manifest: PackManifest): void {
  fs.writeFileSync(path.join(root, 'abuddy.json'), JSON.stringify(manifest, null, 2) + '\n');
}

export function addFeature(manifest: PackManifest, id: string, entry: PackFeatureEntry): void {
  if (!manifest.features) manifest.features = {};
  if (manifest.features[id]) throw new Error(`Feature "${id}" already exists in manifest`);
  manifest.features[id] = entry;
}

/** The `extensions` section, created on the first contribution a scaffold adds to the pack */
function extensions(manifest: PackManifest): NonNullable<PackManifest['extensions']> {
  manifest.extensions ??= {};
  return manifest.extensions;
}

/** Adds a flow step: `entry` names where each of its facets lives */
export function addStep(manifest: PackManifest, type: string, entry: StepEntry): void {
  const ext = extensions(manifest);
  ext.steps ??= {};
  if (ext.steps[type]) throw new Error(`Step "${type}" already exists in manifest`);
  ext.steps[type] = entry;
}

/** Adds an artifact type: `icon` is a lucide-vue-next export name, `component` the path to its viewer */
export function addArtifact(
  manifest: PackManifest,
  type: string,
  entry: { icon: string; component: string },
): void {
  const ext = extensions(manifest);
  ext.artifacts ??= {};
  if (ext.artifacts[type]) throw new Error(`Artifact "${type}" already exists in manifest`);
  ext.artifacts[type] = { icon: entry.icon, fe: entry.component };
}

/** Adds a message block: `component` is the path to the `.vue` file that draws it */
export function addBlock(
  manifest: PackManifest,
  type: string,
  entry: { kind?: 'input'; component: string },
): void {
  const ext = extensions(manifest);
  ext.blocks ??= {};
  if (ext.blocks[type]) throw new Error(`Block "${type}" already exists in manifest`);
  ext.blocks[type] = { ...(entry.kind ? { kind: entry.kind } : {}), fe: entry.component };
}

/**
 * Adds a migration under one version line: the key is the version it targets, which is why the module it
 * names states only its description and its `up`, and the line says what that version is a version of —
 * `pack` the pack's own, `app` AgentBuddy's. A root key rather than an `extensions` one: a migration moves
 * the pack's own stored data rather than contributing anything to the app.
 */
export function addMigration(manifest: PackManifest, line: MigrationLine, version: string, target: string): void {
  const migrations = manifest.migrations ?? (manifest.migrations = {});
  const onLine = migrations[line] ?? (migrations[line] = {});
  if (onLine[version]) throw new Error(`Migration "${version}" already exists in manifest under "${line}"`);
  onLine[version] = target;
}

/** Adds a pack-level service: `target` is "path#exportName" of the service object */
export function addPackService(manifest: PackManifest, key: string, target: string): void {
  const ext = extensions(manifest);
  ext.services ??= {};
  if (ext.services[key]) {
    throw new Error(`Pack service "${key}" already exists in manifest`);
  }
  ext.services[key] = target;
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
