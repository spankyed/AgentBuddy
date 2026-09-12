import { z } from 'zod';

// ── Sub-schemas ─────────────────────────────────────────────────────

export const StepDSLMetaSchema = z.object({
  primaryField: z.string().optional(),
  defaultLabel: z.string().optional(),
  custom: z.literal(true).optional(),
}).strict();

export const StepEntrySchema = z.object({
  type: z.string(),
  path: z.string(),
  kind: z.enum(['step', 'trigger']).optional(),
  dsl: StepDSLMetaSchema.optional(),
}).strict();

export const DslEntrySchema = z.object({
  entry: z.string(),
  targets: z.array(z.enum(['monaco'])),
  prefix: z.string().optional(),
  globals: z.record(z.string(), z.string()).optional(),
}).strict();

export const SeedEntryConfigSchema = z.object({
  path: z.string().optional(),
  seeder: z.string().optional(),
  entityType: z.string().optional(),
  lookupField: z.string().optional(),
}).strict();

export const BootConfigSchema = z.object({
  earlySystem: z.string().describe('Built-in packs only. Ignored for external packs.').optional(),
  createDefaultSettings: z.string().optional(),
  hooks: z.string().optional(),
  seed: z.record(z.string(), z.union([z.string(), SeedEntryConfigSchema])).optional(),
  seedPolicy: z.object({
    skipAtBoot: z.array(z.string()).optional(),
    skipAfterOnboarding: z.array(z.string()).optional(),
  }).strict().optional(),
}).strict();

const SystemSchema = z.object({
  entry: z.string(),
  outgoingEventsType: z.string().optional(),
  events: z.object({
    incoming: z.array(z.string()).optional(),
    outgoing: z.array(z.string()).optional(),
  }).strict().optional(),
}).strict();

const PluginSchema = z.object({
  entry: z.string(),
  label: z.string(),
  icon: z.string(),
  isPinned: z.boolean().optional(),
}).strict();

export const FeatureEntrySchema = z.object({
  id: z.string(),
  designation: z.string().optional(),
  settings: z.string().optional(),
  typesEntry: z.string().optional(),
  earlySystem: z.boolean().describe('Built-in packs only. Ignored for external packs.').optional(),
  system: SystemSchema.optional(),
  plugin: PluginSchema.optional(),
  services: z.record(z.string(), z.string()).default({}),
  contributions: z.string().describe('Built-in packs only. Ignored for external packs.').optional(),
  priority: z.number().int().optional(),
  entities: z.array(z.string()).optional(),
}).strict();

// Deprecated — use features instead. Kept for backward compatibility with external packs.
const PluginSystemSchema = z.object({
  entry: z.string(),
  events: z.object({
    incoming: z.array(z.string()).optional(),
    outgoing: z.array(z.string()).optional(),
  }).strict().optional(),
}).strict();

export const PluginDefinitionSchema = z.object({
  id: z.string(),
  designation: z.string().optional(),
  priority: z.number().int().optional(),
  system: PluginSystemSchema.optional(),
  plugin: PluginSchema.optional(),
  entities: z.array(z.string()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const PackPermissionSchema = z.enum(['ears', 'llm', 'filesystem', 'network', 'terminal']);

const PartitionPolicySchema = z.object({
  excludedEntityTypes: z.array(z.string()).optional(),
  secretEntityTypes: z.array(z.string()).optional(),
}).strict().describe('Built-in packs only. Ignored for external packs.');

const EntityShapeSchema = z.object({
  source: z.string(),
  type: z.string(),
}).strict();

const FEConfigSchema = z.object({
  entry: z.string().optional(),
  tiptapPlugins: z.string().optional(),
  appExtensions: z.record(z.string(), z.string()).optional(),
  styles: z.string().optional(),
}).strict();

const StepsSchema = z.union([
  z.string().describe('Deprecated shorthand — use the object form with register + definitions.'),
  z.object({
    register: z.string(),
    definitions: z.array(StepEntrySchema),
  }).strict(),
]);

// ── Main manifest schema ────────────────────────────────────────────

export const ManifestSchema = z.object({
  $schema: z.string().optional(),
  $manifestVersion: z.literal(1).optional()
    .describe('Schema version. Enables future format evolution.'),
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'Must be a semver version string'),
  builtIn: z.boolean().optional(),
  description: z.string().optional(),
  hostVersion: z.string().optional(),
  license: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  permissions: z.array(PackPermissionSchema).optional(),
  entities: z.record(z.string(), z.string()).optional(),
  relKinds: z.record(z.string(), z.string()).optional(),
  partitionPolicy: PartitionPolicySchema.optional(),
  entityShapes: z.record(z.string(), EntityShapeSchema).optional(),
  features: z.array(FeatureEntrySchema).optional(),
  plugins: z.array(PluginDefinitionSchema).optional()
    .describe('Deprecated — use features instead.'),
  defaultPlugin: z.string().optional(),
  packServices: z.record(z.string(), z.string()).optional(),
  boot: BootConfigSchema.optional(),
  seedTypes: z.array(z.string()).optional()
    .describe('Deprecated. Seed types are derived from boot.seed keys.'),
  steps: StepsSchema.optional(),
  artifacts: z.string().optional(),
  blocks: z.string().optional(),
  migrations: z.string().optional(),
  fe: FEConfigSchema.optional(),
  dsl: z.record(z.string(), DslEntrySchema).optional(),
}).strict();
