import * as path from 'node:path';
import { SPECIALTY_SEED_KEYS } from '../manifest-schema.ts';
import { SEED_COMPILERS_FILE, type PackManifest, type SeedFormatConfig } from '../manifest.ts';

/** What resolving a dependency's formats needs: its manifest, and its build dir for compiler modules */
export interface SeedDependency {
  manifest: PackManifest;
  /** The dependency's build dir, holding seed-compilers.mjs (absent when only settings are resolved) */
  buildDir?: string;
}

/** Where a format's compiler module loads from, and which export compiles */
export interface SeedCompilerModuleRef {
  /** Absolute module path: the pack's own source module, or a dependency's seed-compilers.mjs (unknown without its build dir) */
  module?: string;
  exportName: string;
}

/** A `boot.seed` entry with its format's settings */
export type ResolvedSeed =
  | { kind: 'specialty'; path: string }
  | { kind: 'seeder'; seeder: string }
  | {
    kind: 'format';
    /** Source path, relative to the seeding pack */
    path: string;
    /** The format reference as written: `name` or `pack:name` */
    formatRef: string;
    format: SeedFormatConfig;
    /** Set when the format compiles with a compiler module */
    compiler?: SeedCompilerModuleRef;
  };

const FORMAT_REF = /^(?:([a-z][a-z0-9-]*):)?([a-z][a-z0-9-]*)$/;

/**
 * Resolves each `boot.seed` entry: specialty keys to their path, pack seeders to their module, and
 * format entries to the settings of the format they name, in this pack's `seedFormats` or a
 * dependency's. A dependency's compiler module is its bundled seed-compilers.mjs export.
 */
export function resolveSeeds(
  manifest: PackManifest,
  packDir: string,
  dependencies: ReadonlyMap<string, SeedDependency> = new Map(),
): Record<string, ResolvedSeed> {
  const resolved: Record<string, ResolvedSeed> = {};
  for (const [key, entry] of Object.entries(manifest.boot?.seed ?? {})) {
    if (SPECIALTY_SEED_KEYS.includes(key)) {
      const sourcePath = typeof entry === 'string' ? entry : entry.path;
      if (!sourcePath) throw new Error(`Seed "${key}": give its source as a path`);
      resolved[key] = { kind: 'specialty', path: sourcePath };
    } else if (typeof entry === 'string') {
      throw new Error(`Unknown seed key "${key}": only ${SPECIALTY_SEED_KEYS.join(', ')} take a path`);
    } else if (entry.seeder) {
      resolved[key] = { kind: 'seeder', seeder: entry.seeder };
    } else {
      if (!entry.path || !entry.format) throw new Error(`Seed "${key}" must be { "path", "format" } or { "seeder" }`);
      resolved[key] = { kind: 'format', path: entry.path, formatRef: entry.format, ...resolveFormat(key, entry.format, manifest, packDir, dependencies) };
    }
  }
  return resolved;
}

function resolveFormat(
  key: string,
  ref: string,
  manifest: PackManifest,
  packDir: string,
  dependencies: ReadonlyMap<string, SeedDependency>,
): { format: SeedFormatConfig; compiler?: SeedCompilerModuleRef } {
  const [, pack, name] = FORMAT_REF.exec(ref) ?? [];
  if (!name) throw new Error(`Seed "${key}": "${ref}" isn't a format name or "<dependency id>:<name>"`);

  if (pack === undefined) {
    const format = manifest.seedFormats?.[name];
    if (!format) throw new Error(`Seed "${key}": no format "${name}" in seedFormats`);
    return { format, ...(format.compiler && { compiler: { module: path.resolve(packDir, format.compiler), exportName: 'default' } }) };
  }

  const dependency = dependencies.get(pack);
  if (!dependency) throw new Error(`Seed "${key}": format "${ref}" names "${pack}", which isn't a resolved dependency`);
  const format = dependency.manifest.seedFormats?.[name];
  if (!format) throw new Error(`Seed "${key}": dependency "${pack}" has no format "${name}"`);
  if (!format.compiler) return { format };
  return { format, compiler: { ...(dependency.buildDir && { module: path.join(dependency.buildDir, SEED_COMPILERS_FILE) }), exportName: name } };
}
