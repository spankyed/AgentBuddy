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
  /** The packs read: the app's built-in packs, then the enabled external ones */
  packs: Array<{ id: string; builtIn: boolean }>;
  /**
   * Why this schema is incomplete, or nothing when the data dir accounted for itself.
   *
   * It is a field rather than a warning because a *write* against an incomplete schema corrupts: the engine
   * asks it whether a name is an entity type, and for one it has never heard of `tx('Note')` takes the name
   * for an id and writes a row literally called `Note` instead of minting one. So `openAppDatabase` refuses
   * a writable open, and only a read degrades.
   */
  degraded?: string;
  /** Things worth telling the user that are not degradation — a `--schema-from` that turned out unnecessary */
  notes: string[];
}

/** The directories and files of a data dir the schema is read from */
export type SchemaContext = Pick<AppContext, 'userDataDir' | 'packsDir' | 'hostPacksDir' | 'installedPacksFile'>;

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
    .map((entry) => path.join(hostPacksDir, entry.name, PACK_LAYOUT.snapshot))
    .filter((file) => fs.existsSync(file))
    .map((file) => packEARS(readJSON<PackSnapshot>(file, "a built-in pack's snapshot").manifest, file));
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
function externalManifests({ packsDir, installedPacksFile }: SchemaContext): PackManifest[] {
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
 * A snapshot named by `--schema-from`, in any of the three shapes a built pack has on disk: the file itself, a
 * published pack dir (`<dir>/types/snapshot.json`, what `publishHostPackOutput` writes) or a build output
 * (`<dir>/snapshot.json`, what `abuddy build` leaves in `dist/`).
 */
function namedManifest(schemaFrom: string): PackManifest {
  const candidates = schemaFrom.endsWith('.json')
    ? [schemaFrom]
    : [path.join(schemaFrom, PACK_LAYOUT.snapshot), path.join(schemaFrom, 'snapshot.json')];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) {
    throw new Error(candidates.length === 1
      ? `No pack snapshot at ${schemaFrom}`
      : `No pack snapshot under ${schemaFrom}: looked for ${candidates.join(' and ')}`);
  }
  return packEARS(readJSON<PackSnapshot>(file, "a pack's snapshot").manifest, file);
}

/**
 * The schema of the packs installed in a data dir, as the app registers them: entity types and relation kinds from
 * every loaded pack, the partition policy from the built-in packs only (the app ignores an external pack's).
 *
 * **The built-in packs are the data dir's own account of itself, and a data dir need not have one.** The app
 * publishes their snapshots when it starts, so a dir written by a version that predates that — or one restored from
 * a backup, or copied without `host-packs/` — has nothing to read. `schemaFrom` is then how a caller supplies it,
 * and with neither the schema falls back to the names the app itself declares.
 *
 * That last step degrades reads rather than failing them: hydration never consults the entity types (it derives
 * each row's type from its id), so every row still loads and is reachable by id. What breaks is a query that starts
 * from a *name* — and silently, because `EARS.Entity.Whatever` is `undefined` for a name nobody declared and
 * `qx(undefined)` answers with the whole database. So `onDegraded` is reported rather than logged quietly, and a
 * caller that can refuse to write should.
 */
export function readInstalledSchema(context: SchemaContext, options: { schemaFrom?: string } = {}): InstalledSchema {
  const published = builtInManifests(context.hostPacksDir);
  // Resolved whether or not it is needed, so a path that names nothing is an error rather than a flag that
  // quietly did nothing: `--schema-from /typo.json` against a dir with its own snapshots used to answer
  // normally and say not a word.
  const named = options.schemaFrom === undefined ? undefined : namedManifest(options.schemaFrom);
  const builtIn = published.length > 0 ? published : named ? [named] : [];
  const notes = named && published.length > 0
    ? [`${context.userDataDir} publishes its own built-in pack snapshots, so --schema-from ${options.schemaFrom} was not used.`]
    : [];
  const degraded = builtIn.length === 0
    ? `${context.userDataDir} has no built-in pack snapshots in ${context.hostPacksDir}, so only AgentBuddy's own `
      + "entity types are known. Rows still load and are reachable by id, but a query that starts from a pack's "
      + 'entity type cannot be written. Name a snapshot with --schema-from to read them.'
    : undefined;
  const external = externalManifests(context);

  const entities: Record<string, string> = {
    ...SDK_ENTITIES,
    ...Object.fromEntries(HOST_ENTITY_TYPES.map((type) => [type, type])),
  };
  const relKinds: Record<string, string> = { ...SDK_REL_KINDS };
  const entityOwners = new Map<string, string>(Object.keys(entities).map((name) => [name, 'AgentBuddy']));
  const relKindOwners = new Map<string, string>(Object.entries(relKinds).flatMap(([name, value]) => [[name, 'AgentBuddy'], [value, 'AgentBuddy']] as Array<[string, string]>));
  for (const manifest of [...builtIn, ...external]) {
    addNames(entities, entityOwners, manifest.id, manifest.entities, 'entity type');
    addNames(relKinds, relKindOwners, manifest.id, manifest.relKinds, 'relation kind');
  }
  const entityTypes = new Set(Object.values(entities));

  return {
    entities,
    relKinds,
    packs: [...builtIn.map(({ id }) => ({ id, builtIn: true })), ...external.map(({ id }) => ({ id, builtIn: false }))],
    getRegisteredEntityTypes: () => entityTypes,
    ...(degraded !== undefined && { degraded }),
    notes,
  };
}
