import * as path from 'path';
import type { z } from 'zod';
import type {
  ManifestSchema, FeatureEntrySchema, BootConfigSchema, SeedEntryConfigSchema,
  StepEntrySchema, StepDSLMetaSchema, PluginDefinitionSchema, DslEntrySchema,
  PackPermissionSchema,
} from './manifest-schema';

// Types derived from the canonical Zod schema in manifest-schema.ts.
// The schema is the single source of truth; these re-exports preserve
// the existing import surface so no consumer code needs to change.

export type PackManifest = z.infer<typeof ManifestSchema>;
export type PackFeatureEntry = z.infer<typeof FeatureEntrySchema>;
export type PackBootConfig = z.infer<typeof BootConfigSchema>;
export type SeedEntryConfig = z.infer<typeof SeedEntryConfigSchema>;
export type StepEntry = z.infer<typeof StepEntrySchema>;
export type StepDSLMeta = z.infer<typeof StepDSLMetaSchema>;
export type PackPluginDefinition = z.infer<typeof PluginDefinitionSchema>;
export type DslEntry = z.infer<typeof DslEntrySchema>;
export type PackPermission = z.infer<typeof PackPermissionSchema>;

export type PackSystemEntry = NonNullable<PackPluginDefinition['system']>;
export type PackPluginEntry = NonNullable<PackPluginDefinition['plugin']>;

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
}

export function seedFile(name: string): string {
  return `${name}.seed.json`;
}

export function seedPath(compiledDir: string, name: string): string {
  return path.join(compiledDir, seedFile(name));
}
