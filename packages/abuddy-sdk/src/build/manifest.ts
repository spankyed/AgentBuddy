import * as path from 'path';
import type { z } from 'zod';
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

export interface PackSnapshot {
  types: PackTypeManifest;
  defs: Record<string, string>;
  manifest: PackManifest;
  sdkVersion?: string;
  /** The pack's flow helpers, which dependents' generated flow helpers re-export */
  flowHelpers?: PackFlowHelpers;
  /**
   * The commands the pack's dependencies declare, their own dependencies' included, with the pack
   * declaring each: a dependent reads the whole tree from its direct dependencies' snapshots.
   */
  dependencyCommands?: DependencyCommand[];
  /**
   * The plugins the pack's dependencies own, their own dependencies' included, with the pack owning
   * each — read the same way, and for the same reason: a dependent sees the whole tree from its
   * direct dependencies' snapshots. Only a *direct* dependency's plugin can be sent to, because a
   * send is typed against that pack's `PackEvents` and only a direct dependency has a facade to name
   * it. This list is what lets the build say so, instead of reporting the plugin as unknown.
   */
  dependencyPlugins?: DependencyPlugin[];
}

/** A command declared somewhere in a pack's dependency tree, and the pack declaring it */
export interface DependencyCommand {
  name: string;
  packId: string;
}

/** What `_dependencyCommands` reads from a dependency's snapshot */
export interface DependencyCommandSource {
  manifest: { commands?: ReadonlyArray<{ name: string }> };
  dependencyCommands?: ReadonlyArray<DependencyCommand>;
}

/** A plugin owned somewhere in a pack's dependency tree, and the pack owning it */
export interface DependencyPlugin {
  id: string;
  packId: string;
}

/** What `_dependencyPlugins` reads from a dependency's snapshot */
export interface DependencyPluginSource {
  manifest: { features?: ReadonlyArray<{ id: string; plugin?: unknown }> };
  dependencyPlugins?: ReadonlyArray<DependencyPlugin>;
}

/**
 * @internal Host-only: abuddy CLI build tooling.
 *
 * The commands declared across these dependencies and everything they depend on, once each, with the
 * declaring pack. The app refuses a pack whose command another registered pack declares.
 */
export function _dependencyCommands(snapshots: ReadonlyArray<readonly [string, DependencyCommandSource]>): DependencyCommand[] {
  const owners = new Map<string, string>();
  for (const [depId, snapshot] of snapshots) {
    for (const { name, packId } of snapshot.dependencyCommands ?? []) owners.set(name, packId);
    for (const { name } of snapshot.manifest.commands ?? []) owners.set(name, depId);
  }
  return [...owners].map(([name, packId]) => ({ name, packId }));
}

/**
 * @internal Host-only: abuddy CLI build tooling.
 *
 * The plugins owned across these dependencies and everything they depend on, once each, with the
 * owning pack. A nearer pack wins, as it does for commands: that is the one a dependent could add to
 * its own dependencies to reach the plugin.
 */
export function _dependencyPlugins(snapshots: ReadonlyArray<readonly [string, DependencyPluginSource]>): DependencyPlugin[] {
  const owners = new Map<string, string>();
  for (const [depId, snapshot] of snapshots) {
    for (const { id, packId } of snapshot.dependencyPlugins ?? []) owners.set(id, packId);
    for (const feature of snapshot.manifest.features ?? []) if (feature.plugin) owners.set(feature.id, depId);
  }
  return [...owners].map(([id, packId]) => ({ id, packId }));
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
