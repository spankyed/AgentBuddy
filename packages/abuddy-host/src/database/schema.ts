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

function readJSON<T>(file: string, what: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new Error(`${file} isn't readable ${what}: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error(`${file} isn't ${what}`);
  return parsed as T;
}

/** A manifest's entity types and relation kinds, whatever else it holds */
function packEARS(manifest: PackManifest | undefined, file: string): PackManifest {
  if (!manifest || typeof manifest !== 'object') throw new Error(`${file} holds no pack manifest`);
  for (const [field, names] of [['entities', manifest.entities], ['relKinds', manifest.relKinds]] as const) {
    if (names !== undefined && (typeof names !== 'object' || Array.isArray(names))) {
      throw new Error(`${file}: the manifest's ${field} isn't a set of names`);
    }
  }
  return manifest;
}

/** The built-in packs the app published to the data dir (`hostPacksDir/<id>/types/snapshot.json`) */
function builtInManifests(hostPacksDir: string): PackManifest[] {
  if (!fs.existsSync(hostPacksDir)) return [];
  return fs.readdirSync(hostPacksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => path.join(hostPacksDir, entry.name, BUNDLE_PATHS.snapshot))
    .filter((file) => fs.existsSync(file))
    .map((file) => packEARS(readJSON<PackSnapshot>(file, "a built-in pack's snapshot").manifest, file));
}

/**
 * The packs the registry file lists as disabled. A file it can't read is refused rather than read as "nothing is
 * disabled", which would take in packs the app leaves out.
 */
function disabledPacks(registryFile: string): Set<string> {
  if (!fs.existsSync(registryFile)) return new Set();
  const { packs } = readJSON<{ packs?: unknown }>(registryFile, 'the installed packs');
  if (!Array.isArray(packs)) throw new Error(`${registryFile} lists no installed packs`);
  return new Set(packs.filter((pack) => (pack as { enabled?: unknown }).enabled === false).map((pack) => String((pack as { id?: unknown }).id)));
}

/**
 * The external packs the app loads from `packsDir`: those the registry doesn't list as disabled (the app registers a
 * pack it hasn't listed yet as enabled)
 */
function externalManifests({ packsDir, registryFile }: SchemaContext): PackManifest[] {
  const disabled = disabledPacks(registryFile);
  return discoverPacks(packsDir)
    .map(({ manifest, dir }) => packEARS(manifest, path.join(dir, 'abuddy.json')))
    .filter((manifest) => !disabled.has(manifest.id));
}

/**
 * Adds a pack's names to `names`, refusing one another pack or the app already declares: the app's registry refuses
 * the same collision when it registers packs, so a tool that took the last one would read the database by a schema
 * the app can't even start with.
 */
function addNames(names: Record<string, string>, owners: Map<string, string>, pack: string, declared: Record<string, string> | undefined, what: string): void {
  for (const [name, value] of Object.entries(declared ?? {})) {
    for (const key of [name, value]) {
      const owner = owners.get(key);
      if (owner !== undefined && owner !== pack) throw new Error(`Two packs declare the ${what} ${key}: "${owner}" and "${pack}"`);
      owners.set(key, pack);
    }
    names[name] = value;
  }
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
  const entityOwners = new Map<string, string>([...Object.keys(entities)].map((name) => [name, 'AgentBuddy']));
  const relKindOwners = new Map<string, string>([...Object.entries(relKinds)].flatMap(([name, value]) => [[name, 'AgentBuddy'], [value, 'AgentBuddy']] as Array<[string, string]>));
  for (const manifest of [...builtIn, ...external]) {
    addNames(entities, entityOwners, manifest.id, manifest.entities, 'entity type');
    addNames(relKinds, relKindOwners, manifest.id, manifest.relKinds, 'relation kind');
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
