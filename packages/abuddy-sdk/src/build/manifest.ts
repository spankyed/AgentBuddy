import * as path from 'path';
import type { z } from 'zod';
import { resolveName } from '../ids/refs.ts';
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

/**
 * The format of a pack's build, recorded in its snapshot: everything another abuddy reads from what `abuddy build`
 * wrote. A dependent's codegen reads the facade types in `defs['pack-types']` and the exports generated code imports
 * from them, `types`, `provenance` and its kinds, `flowHelpers`, and the manifest's fields. The app loads the
 * registration the runtime bundle exports, and refuses to install or load a build in another format.
 *
 * A build and the abuddy reading it are often different versions: an installed AgentBuddy publishes its built-in
 * packs' snapshots, a GitHub release carries the snapshot its author's CLI wrote, and an installed pack runs in whatever
 * AgentBuddy the user updates to. The two must agree exactly, because a disagreement doesn't fail where it happens: a
 * reshaped field is read as absent, a renamed facade export surfaces as TS2305 inside generated code, a reshaped
 * registration as a feature id nobody wrote.
 *
 * Bump it with any change the other side would misread: a field, facade export, provenance kind, manifest or
 * registration field removed, renamed or reshaped, or keys that now mean something else. Bump it once per release
 * that changes the contract, not per change: only a released abuddy's builds can meet another version's, so changes
 * made since the last release share its next number. The codegen spec's "the snapshot format" case lists what it
 * covers, and fails when that list changes so the change is decided rather than missed.
 */
export const PACK_SNAPSHOT_FORMAT = 1;

export interface PackTypeManifest {
  entities: Record<string, string>;
  relKinds: Record<string, string>;
}

export interface PackSnapshot {
  types: PackTypeManifest;
  defs: Record<string, string>;
  manifest: PackManifest;
  /** The `PACK_SNAPSHOT_FORMAT` of the CLI that wrote it; a snapshot without one predates the format */
  format: number;
  sdkVersion?: string;
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
 * A build whose snapshot is in another format than `PACK_SNAPSHOT_FORMAT`: what's wrong, and which side is older, since
 * that decides which one moves. Each reader adds its own remedy.
 *
 * @internal Host-only: the abuddy CLI, the pack test harness and the app's pack loader.
 */
export interface SnapshotFormatMismatch {
  /** Written by a newer abuddy than the reader: only then can an older build of the same pack still match */
  newer: boolean;
  /** `its snapshot is format 2, written by a newer abuddy CLI (SDK 0.4.0)` */
  problem: string;
}

/**
 * The build's mismatch with this abuddy's snapshot format, or undefined when they agree.
 *
 * @internal Host-only: the abuddy CLI, the pack test harness and the app's pack loader.
 */
export function _snapshotFormatMismatch(snapshot: { format?: unknown; sdkVersion?: string }): SnapshotFormatMismatch | undefined {
  const { format } = snapshot;
  if (format === PACK_SNAPSHOT_FORMAT) return undefined;
  const newer = typeof format === 'number' && format > PACK_SNAPSHOT_FORMAT;
  const builtWith = snapshot.sdkVersion ? ` (SDK ${snapshot.sdkVersion})` : '';
  return {
    newer,
    problem: `its snapshot is format ${typeof format === 'number' ? format : '(none)'}, written by ${newer ? 'a newer' : 'an older'} abuddy CLI${builtWith}`,
  };
}

/**
 * A mismatch as a CLI reading a dependency states it
 *
 * @internal Host-only: the abuddy CLI and the pack test harness.
 */
export function _cliFormatMismatchMessage({ problem }: SnapshotFormatMismatch): string {
  return `${problem}; this CLI reads format ${PACK_SNAPSHOT_FORMAT}. Build it and this pack with the same abuddy version`;
}

/**
 * How each kind of declared name is read off a manifest, given the pack it belongs to. Adding a kind is
 * an entry here: the reader, the snapshot field and every consumer are already generic over it.
 */
export const PROVENANCE_KINDS = {
  entities: (m: ProvenanceManifest) => Object.keys(m.entities ?? {}),
  relKinds: (m: ProvenanceManifest) => Object.keys(m.relKinds ?? {}),
  commands: (m: ProvenanceManifest) => (m.commands ?? []).map((c) => c.name),
  // Keyed by ref, so a dependent reusing one of its dependency's feature ids keeps both apart
  plugins: (m: ProvenanceManifest, packId: string) => (m.features ?? []).filter((f) => f.plugin).map((f) => resolveName(f.id, packId)),
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
