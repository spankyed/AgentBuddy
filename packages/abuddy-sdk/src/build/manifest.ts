import * as path from 'path';
import type { z } from 'zod';
import { qualifiedId } from '../ids/addressing.ts';
import type {
  ManifestSchema, FeatureEntrySchema, BootConfigSchema, SeedEntryConfigSchema, SeedFormatSchema,
  StepEntrySchema, StepDSLMetaSchema, DslEntrySchema, PackPermissionSchema,
} from './manifest-schema.ts';

// Types derived from the canonical Zod schema in manifest-schema.ts.
// The schema is the single source of truth; these re-exports preserve
// the existing import surface so no consumer code needs to change.

export type PackManifest = z.infer<typeof ManifestSchema>;
export type PackFeatureEntry = z.infer<typeof FeatureEntrySchema>;
export type PackBootConfig = z.infer<typeof BootConfigSchema>;
export type SeedEntryConfig = z.infer<typeof SeedEntryConfigSchema>;
export type SeedFormatConfig = z.infer<typeof SeedFormatSchema>;
export type StepEntry = z.infer<typeof StepEntrySchema>;
export type StepDSLMeta = z.infer<typeof StepDSLMetaSchema>;
export type DslEntry = z.infer<typeof DslEntrySchema>;
export type PackPermission = z.infer<typeof PackPermissionSchema>;

export type PackSystemEntry = NonNullable<PackFeatureEntry['system']>;
export type PackPluginEntry = NonNullable<PackFeatureEntry['plugin']>;

// Not part of abuddy.json — used for dist/snapshot.json and build-time type exchange.
export interface PackTypeManifest {
  entities: Record<string, string>;
  relKinds: Record<string, string>;
}

/**
 * The shape of the facade types a pack publishes for its dependents (`dist/types/pack-types.d.ts`
 * and the snapshot's `defs`), recorded so a build can say how a dependency's facade was produced.
 *
 * This is diagnostic context, not a compatibility gate. Whether a dependency's facade can be built
 * against is decided by `requireFacadeExports` in `generate-entries.ts`, which checks for the exports
 * the generated code actually imports. A format number is only a proxy for that: it fails a
 * dependency whose facade changed in ways the dependent never touches, and it names a number rather
 * than the missing export. Bumping this changes no build's outcome — it only makes a real failure's
 * message more useful, so bump it when the generated facade's shape changes.
 *
 * A dependency built before facades existed has no `defs[PACK_TYPES_DEF]` at all; that is a separate
 * path, reported where a `sendsTo` names one of its plugins.
 */
export const PACK_TYPES_FORMAT = 1;

export interface PackSnapshot {
  types: PackTypeManifest;
  defs: Record<string, string>;
  manifest: PackManifest;
  sdkVersion?: string;
  /** The facade shape this pack's `defs` are in (`PACK_TYPES_FORMAT` when it was built) */
  typesFormat?: number;
  /**
   * What everything this pack's tree declares is declared by: kind → name → the pack declaring it.
   *
   * A snapshot has to tell a dependent about the whole tree, not just this pack, because a dependent
   * sees only its direct dependencies' snapshots. Without it, a dependent of two packs that share an
   * ancestor sees the ancestor's names arriving from both and reads that as two packs declaring the
   * same name — a collision that isn't one. Every pack depends on the base pack, so that is every
   * diamond.
   *
   * Every kind — entities, relation kinds, commands, plugins — goes through one algorithm,
   * `_mergeProvenance`, and `PROVENANCE_KINDS` is where a new kind costs a line rather than a
   * differently-shaped field with a reader of its own.
   */
  provenance?: PackProvenance;
  /** The pack's flow helpers, which dependents' generated flow helpers re-export */
  flowHelpers?: PackFlowHelpers;
}

/**
 * How each kind of declared name is read off a manifest, given the pack it belongs to. Adding a kind is
 * an entry here: the reader, the snapshot field and every consumer are already generic over it.
 */
export const PROVENANCE_KINDS = {
  entities: (m: ProvenanceManifest) => Object.keys(m.entities ?? {}),
  relKinds: (m: ProvenanceManifest) => Object.keys(m.relKinds ?? {}),
  commands: (m: ProvenanceManifest) => (m.commands ?? []).map((c) => c.name),
  // Keyed by address, so a dependent reusing one of its dependency's feature ids keeps both apart
  plugins: (m: ProvenanceManifest, packId: string) => (m.features ?? []).filter((f) => f.plugin).map((f) => qualifiedId(packId, f.id)),
} as const;

export type ProvenanceKind = keyof typeof PROVENANCE_KINDS;

/** Declared name → the pack that declares it, per kind. Absent kinds declared nothing. */
export type PackProvenance = Partial<Record<ProvenanceKind, Record<string, string>>>;

/** The parts of a manifest `PROVENANCE_KINDS` reads; a `PackManifest` satisfies it */
export interface ProvenanceManifest {
  entities?: Record<string, string>;
  relKinds?: Record<string, string>;
  commands?: ReadonlyArray<{ name: string }>;
  features?: ReadonlyArray<{ id: string; plugin?: unknown }>;
}

/**
 * @internal Host-only: abuddy CLI build tooling.
 *
 * A record of declared names, safe to index with any of them.
 *
 * Declared names come from a manifest, and the schemas allow names that mean something to an ordinary
 * object: `constructor` matches the command-name and feature-id patterns, and `entities`/`relKinds` are
 * unrestricted strings. On an ordinary object `record['constructor']` returns `Object`'s constructor
 * rather than `undefined`, and `record['__proto__'] = id` sets the prototype instead of adding an entry.
 * A null-prototype record has neither: nothing is inherited to find, and `__proto__` is an ordinary key.
 *
 * Copying is by `Object.keys`, own enumerable properties only — which is exactly what a snapshot read
 * back from disk holds, since `JSON.parse` *defines* `__proto__` as an own property where assignment
 * would not. That asymmetry is why the write side loses the name and the read side does not.
 */
export function _provenanceRecord(source?: Record<string, string>): Record<string, string> {
  const record: Record<string, string> = Object.create(null);
  if (source) for (const name of Object.keys(source)) record[name] = source[name];
  return record;
}

/** What `_mergeProvenance` reads from a dependency: its own manifest, and what it inherited */
export interface ProvenanceSource {
  manifest: ProvenanceManifest;
  provenance?: PackProvenance;
}

/**
 * @internal Host-only: abuddy CLI build tooling.
 *
 * Every name of `kind` declared across these dependencies and everything they depend on, once each,
 * with the pack declaring it. `own` folds in the pack being built, which declares nearer than any of
 * them.
 *
 * The nearer pack wins, which is why each dependency's inherited record goes in before its own
 * manifest: that is the pack a dependent could add to its own dependencies to reach the name.
 */
export function _mergeProvenance(
  kind: ProvenanceKind,
  dependencies: ReadonlyArray<readonly [string, ProvenanceSource]>,
  own?: { id: string; manifest: ProvenanceManifest },
): Record<string, string> {
  const namesOf = PROVENANCE_KINDS[kind];
  const declaredBy = _provenanceRecord();
  for (const [depId, snapshot] of dependencies) {
    const inherited = snapshot.provenance?.[kind];
    if (inherited) for (const name of Object.keys(inherited)) declaredBy[name] = inherited[name];
    for (const name of namesOf(snapshot.manifest, depId)) declaredBy[name] = depId;
  }
  if (own) for (const name of namesOf(own.manifest, own.id)) declaredBy[name] = own.id;
  return declaredBy;
}

/**
 * @internal Host-only: abuddy CLI build tooling.
 *
 * Every kind at once, for writing a snapshot. A kind that declared nothing is left out rather than
 * written as an empty record, so a snapshot says what it means.
 */
export function _buildProvenance(
  dependencies: ReadonlyArray<readonly [string, ProvenanceSource]>,
  own?: { id: string; manifest: ProvenanceManifest },
): PackProvenance {
  const provenance: PackProvenance = {};
  for (const kind of Object.keys(PROVENANCE_KINDS) as ProvenanceKind[]) {
    const declaredBy = _mergeProvenance(kind, dependencies, own);
    if (Object.keys(declaredBy).length > 0) provenance[kind] = declaredBy;
  }
  return provenance;
}

/**
 * A pack's generated flow helpers (src/__generated__/flow-helpers.ts: a helper per step, custom
 * step helpers and trigger track builders, its dependencies' included), bundled by `abuddy build`.
 */
export interface PackFlowHelpers {
  /** The names the module exports */
  exports: string[];
  /** The ES module; only packages stay imports */
  module: string;
  /** Its declarations; only packages stay imports */
  types: string;
}

/** The bundle of a pack's seed compiler modules, in its build dir: dependents compile its formats with it */
export const SEED_COMPILERS_FILE = 'seed-compilers.mjs';

export function seedFile(name: string): string {
  return `${name}.seed.json`;
}

export function seedPath(compiledDir: string, name: string): string {
  return path.join(compiledDir, seedFile(name));
}
