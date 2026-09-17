// The EARS names and partition policy of the packs installed in a data dir, read from their manifests without
// running pack code: what a tool opening the data dir's database needs to hydrate and query it as the app does
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppContext } from '@abuddy/sdk/env';
import type { PackManifest, PackSnapshot } from '@abuddy/sdk/build';
import { SDK_ENTITIES, SDK_REL_KINDS } from '@abuddy/sdk/types';
import type { PartitionPolicy } from '@abuddy/ears';
import { HOST_ENTITY_TYPES } from '../app-state/index.ts';
import { BUNDLE_PATHS } from '../packs/bundle.ts';
import { discoverPacks } from '../packs/pack-discovery.ts';
import { appPartitionPolicy } from '../packs/pack-registration.ts';
import { readPackRegistry } from '../packs/pack-registry.ts';

/** What opening a database needs from the packs: which names are entity types, and where each type is stored */
export interface DatabaseSchema {
  /** The SDK's entity types, the host's and the packs' */
  getRegisteredEntityTypes(): ReadonlySet<string>;
  readonly partitionPolicy: PartitionPolicy;
}

/** The installed packs' schema, with the names a tool shows and the packs it was read from */
export interface InstalledSchema extends DatabaseSchema {
  /** Entity types by name, the SDK's, the host's and the packs' */
  entities: Record<string, string>;
  /** Relation kinds by name, the SDK's and the packs' */
  relKinds: Record<string, string>;
  /** The packs read: the app's built-in packs, then the enabled external ones */
  packs: Array<{ id: string; builtIn: boolean }>;
}

/** The directories and files of a data dir the schema is read from */
export type SchemaContext = Pick<AppContext, 'userDataDir' | 'packsDir' | 'hostPacksDir' | 'registryFile'>;

function readJSON<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

/** The built-in packs the app published to the data dir (`hostPacksDir/<id>/types/snapshot.json`) */
function builtInManifests(hostPacksDir: string): PackManifest[] {
  if (!fs.existsSync(hostPacksDir)) return [];
  return fs.readdirSync(hostPacksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => path.join(hostPacksDir, entry.name, BUNDLE_PATHS.snapshot))
    .filter((file) => fs.existsSync(file))
    .map((file) => readJSON<PackSnapshot>(file).manifest);
}

/**
 * The external packs the app loads from `packsDir`: those the registry doesn't list as disabled (the app registers a
 * pack it hasn't listed yet as enabled)
 */
function externalManifests({ packsDir, registryFile }: SchemaContext): PackManifest[] {
  const disabled = new Set(readPackRegistry(registryFile).filter((entry) => !entry.enabled).map((entry) => entry.id));
  return discoverPacks(packsDir).map(({ manifest }) => manifest).filter((manifest) => !disabled.has(manifest.id));
}

/**
 * The schema of the packs installed in a data dir, as the app registers them: entity types and relation kinds from
 * every loaded pack, the partition policy from the built-in packs only (the app ignores an external pack's). Throws
 * when the data dir has no built-in packs published: the app publishes them when it starts on the data dir.
 */
export function readInstalledSchema(context: SchemaContext): InstalledSchema {
  const builtIn = builtInManifests(context.hostPacksDir);
  if (builtIn.length === 0) {
    throw new Error(`${context.userDataDir} has no built-in packs in ${context.hostPacksDir}: start AgentBuddy on it once`);
  }
  const external = externalManifests(context);

  const entities: Record<string, string> = {
    ...SDK_ENTITIES,
    ...Object.fromEntries(HOST_ENTITY_TYPES.map((type) => [type, type])),
  };
  const relKinds: Record<string, string> = { ...SDK_REL_KINDS };
  for (const manifest of [...builtIn, ...external]) {
    Object.assign(entities, manifest.entities);
    Object.assign(relKinds, manifest.relKinds);
  }
  const excluded = builtIn.flatMap((manifest) => manifest.partitionPolicy?.excludedEntityTypes ?? []);
  const entityTypes = new Set(Object.values(entities));

  return {
    entities,
    relKinds,
    packs: [...builtIn.map(({ id }) => ({ id, builtIn: true })), ...external.map(({ id }) => ({ id, builtIn: false }))],
    getRegisteredEntityTypes: () => entityTypes,
    partitionPolicy: appPartitionPolicy(excluded),
  };
}
