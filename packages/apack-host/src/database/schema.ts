// The EARS names and partition policy of the packs installed in a data dir, read from validated artifacts without
// running pack code: what a tool opening the data dir's database needs to hydrate and query it as the app does
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppEnvironment } from '@apackdev/sdk/env';
import { parseSnapshot, type PackManifest } from '@apackdev/sdk/build';
import { readInstalledPacks } from '../packs/installed.ts';
import { SDK_ENTITIES, SDK_REL_KINDS } from '@apackdev/sdk/types';
import { HOST_ENTITY_TYPES } from '../app-state/index.ts';
import { PACK_LAYOUT } from '../packs/layout.ts';
import { readInstalledPackArtifacts } from '../packs/discovery.ts';

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
  /**
   * Why this schema knows no pack's names, or nothing when it read at least one pack.
   *
   * It is a field rather than a log line because a *write* against names the schema lacks corrupts: the
   * engine asks it whether a name is an entity type, and for one it has never heard of `tx('Note')` takes
   * the name for an id and writes a row literally called `Note` instead of minting one. So
   * `openAppDatabase` refuses a writable open, and only a read degrades — and a read degrades silently,
   * since `EARS.Entity.Note` is `undefined` for an unknown name and `qx(undefined)` answers with the whole
   * database rather than an error.
   *
   * **The condition is "no pack was read", not "the rows are accounted for", and the difference is a hole
   * this does not close.** Rows outlive the pack that declared their types on purpose — uninstalling
   * deletes a pack's directory, not its rows (`AppState.packVersions`) — so a dir with ten packs installed
   * and an eleventh's rows still in it reads as complete here and is not. Closing that needs the entity
   * types present in the data, which only hydration knows; this fires where the whole of a data dir's
   * schema is missing, which is what a failed or absent install of the packs the app ships produces.
   */
  degraded?: string;
  /** Things worth telling the user that are not degradation — a `--schema-from` that turned out unnecessary */
  notes: string[];
}

/** The directories and files of a data dir the schema is read from */
export type SchemaContext = Pick<AppEnvironment, 'userDataDir' | 'packsDir' | 'installedPacksFile'>;

function readJSON(file: string, what: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new Error(`${file} isn't readable ${what}: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error(`${file} isn't ${what}`);
  return parsed;
}

/**
 * Every enabled pack installed in the data dir, admitted through the common artifact reader: everything in `packsDir`
 * that the registry doesn't list as disabled, since the app registers a pack it hasn't listed yet as enabled.
 */
function installedManifests({ packsDir, installedPacksFile }: SchemaContext): PackManifest[] {
  const disabled = new Set(readInstalledPacks(installedPacksFile, { strict: true }).filter(pack => !pack.enabled).map(pack => pack.id));
  return readInstalledPackArtifacts(packsDir).filter(entry => !disabled.has(entry.id)).map(entry => {
    if (!entry.artifact) throw new Error(`Pack "${entry.id}" declarations in ${entry.dir}: ${entry.problem}`);
    return entry.artifact.snapshot.manifest;
  });
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
  const file = schemaFrom.endsWith('.json') ? schemaFrom : path.join(schemaFrom, PACK_LAYOUT.snapshot);
  if (!fs.existsSync(file)) throw new Error(`No pack snapshot at ${file}`);
  const parsed = parseSnapshot(readJSON(file, "a pack's snapshot"));
  if (!parsed.snapshot) throw new Error(`${file}: ${parsed.diagnostics.map(issue => issue.message).join('; ')}`);
  return parsed.snapshot.manifest;
}

/**
 * The schema of the packs installed in a data dir, as the app registers them: entity types and relation
 * kinds from every installed pack's own `apack.json`.
 *
 * **One account of the data dir, which is the packs directory.** Every pack is installed there, the ones
 * the app ships included, so there is no second source to prefer and no dir that holds packs without
 * holding their manifests.
 *
 * A dir with no packs installed knows only the names the app itself declares, and that is reported as
 * `degraded` rather than passed off as a complete reading of it: the statement is true about what is
 * *installed*, and a caller about to write needs to know it is not true about what is *stored*. See the
 * field, which says what it does and does not cover.
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
  const degraded = packs.length === 0
    ? `${context.userDataDir} has no packs installed in ${context.packsDir}, so only apack's own entity `
      + "types are known. Rows still load and are reachable by id, but a query that starts from a pack's "
      + 'entity type cannot be written. Name a snapshot with --schema-from to read them.'
    : undefined;

  const entities: Record<string, string> = {
    ...SDK_ENTITIES,
    ...Object.fromEntries(HOST_ENTITY_TYPES.map((type) => [type, type])),
  };
  const relKinds: Record<string, string> = { ...SDK_REL_KINDS };
  const entityOwners = new Map<string, string>(Object.keys(entities).map((name) => [name, 'apack']));
  const relKindOwners = new Map<string, string>(Object.entries(relKinds).flatMap(([name, value]) => [[name, 'apack'], [value, 'apack']] as Array<[string, string]>));
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
    ...(degraded !== undefined && { degraded }),
    notes,
  };
}
