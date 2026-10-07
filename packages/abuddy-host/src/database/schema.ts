// The EARS names and partition policy of the packs installed in a data dir, read from their manifests without
// running pack code: what a tool opening the data dir's database needs to hydrate and query it as the app does
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppContext } from '@abuddy/sdk/env';
import type { PackManifest, PackSnapshot } from '@abuddy/sdk/build';
import { SDK_ENTITIES, SDK_REL_KINDS } from '@abuddy/sdk/types';
import { HOST_ENTITY_TYPES } from '../app-state/index.ts';
import { PACK_LAYOUT } from '../packs/layout.ts';
import { discoverPacks, enabledExternalPacks } from '../packs/discovery.ts';

/** What opening a database needs from the packs: which names are entity types, and where each type is stored */
export interface DatabaseSchema {
  /** The SDK's entity types, the host's and the packs' */
  getRegisteredEntityTypes(): ReadonlySet<string>;
}

/** The installed packs' schema, with the names a tool shows and the packs it was read from */
export interface InstalledSchema extends DatabaseSchema {
  /** Entity types by name, the SDK's, the host's and the packs' */
  entities: Record<string, string>;
  /** Relation kinds by name, the SDK's and the packs' */
  relKinds: Record<string, string>;
  /** The packs read: every enabled pack installed in the data dir */
  packs: Array<{ id: string }>;
  /** Things worth telling the user that are not degradation — a `--schema-from` that turned out unnecessary */
  notes: string[];
}

/** The directories and files of a data dir the schema is read from */
export type SchemaContext = Pick<AppContext, 'userDataDir' | 'packsDir' | 'installedPacksFile'>;

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

/**
 * The packs `installed-packs.json` lists as disabled. A file it can't read is refused rather than read as "nothing is
 * disabled", which would take in packs the app leaves out.
 */
function disabledPacks(installedPacksFile: string): Set<string> {
  if (!fs.existsSync(installedPacksFile)) return new Set();
  const { packs } = readJSON<{ packs?: unknown }>(installedPacksFile, 'the installed packs');
  if (!Array.isArray(packs)) throw new Error(`${installedPacksFile} lists no installed packs`);
  return new Set(packs.filter((pack) => (pack as { enabled?: unknown }).enabled === false).map((pack) => String((pack as { id?: unknown }).id)));
}

/**
 * The external packs the app loads from `packsDir`: those the registry doesn't list as disabled (the app registers a
 * pack it hasn't listed yet as enabled)
 */
/** Every enabled pack installed in the data dir, from its own `abuddy.json` */
function installedManifests({ packsDir, installedPacksFile }: SchemaContext): PackManifest[] {
  return enabledExternalPacks(discoverPacks(packsDir), disabledPacks(installedPacksFile))
    .map(({ manifest, dir }) => packEARS(manifest, path.join(dir, 'abuddy.json')));
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
 * A snapshot named by `--schema-from`, in either shape a built pack has on disk: the file itself, or a pack
 * directory holding it (`<dir>/types/snapshot.json`, which is where every pack's build writes it).
 */
function namedManifest(schemaFrom: string): PackManifest {
  const candidates = schemaFrom.endsWith('.json')
    ? [schemaFrom]
    : [path.join(schemaFrom, PACK_LAYOUT.snapshot)];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) {
    throw new Error(candidates.length === 1
      ? `No pack snapshot at ${schemaFrom}`
      : `No pack snapshot under ${schemaFrom}: looked for ${candidates.join(' and ')}`);
  }
  return packEARS(readJSON<PackSnapshot>(file, "a pack's snapshot").manifest, file);
}

/**
 * The schema of the packs installed in a data dir, as the app registers them: entity types and relation
 * kinds from every installed pack's own `abuddy.json`.
 *
 * **One account of the data dir, which is the packs directory.** Every pack is installed there, the ones
 * the app ships included, so there is no second source to prefer and no dir that holds packs without
 * holding their manifests. A dir with no packs installed knows only the names the app itself declares,
 * which is the truth about it rather than a degraded reading of it.
 *
 * `schemaFrom` names a snapshot to read *as well*, for a dir whose rows outlived the pack that declared
 * their types. It is resolved whether or not it adds anything, so a path that names nothing is an error
 * rather than a flag that quietly did nothing.
 */
export function readInstalledSchema(context: SchemaContext, options: { schemaFrom?: string } = {}): InstalledSchema {
  const named = options.schemaFrom === undefined ? undefined : namedManifest(options.schemaFrom);
  const installed = installedManifests(context);
  const notes = named && installed.some((manifest) => manifest.id === named.id)
    ? [`${context.userDataDir} has ${named.id} installed, so --schema-from ${options.schemaFrom} added nothing.`]
    : [];
  const packs = [...installed, ...(named && !installed.some((m) => m.id === named.id) ? [named] : [])];

  const entities: Record<string, string> = {
    ...SDK_ENTITIES,
    ...Object.fromEntries(HOST_ENTITY_TYPES.map((type) => [type, type])),
  };
  const relKinds: Record<string, string> = { ...SDK_REL_KINDS };
  const entityOwners = new Map<string, string>(Object.keys(entities).map((name) => [name, 'AgentBuddy']));
  const relKindOwners = new Map<string, string>(Object.entries(relKinds).flatMap(([name, value]) => [[name, 'AgentBuddy'], [value, 'AgentBuddy']] as Array<[string, string]>));
  for (const manifest of packs) {
    addNames(entities, entityOwners, manifest.id, manifest.entities, 'entity type');
    addNames(relKinds, relKindOwners, manifest.id, manifest.relKinds, 'relation kind');
  }
  const entityTypes = new Set(Object.values(entities));

  return {
    entities,
    relKinds,
    packs: packs.map(({ id }) => ({ id })),
    getRegisteredEntityTypes: () => entityTypes,
    notes,
  };
}
