import { z } from 'zod';

// ── Sub-schemas ─────────────────────────────────────────────────────

export const StepDSLMetaSchema = z.object({
  primaryField: z.string().describe('The field whose value becomes the step label in the flow editor.').optional(),
  defaultLabel: z.string().describe('Fallback label when primaryField is empty.').optional(),
  custom: z.literal(true).describe('Marks the step as a custom (non-built-in) type.').optional(),
}).strict();

export const StepEntrySchema = z.object({
  type: z.string().describe('Step type identifier.'),
  path: z.string().describe('Directory containing the step definition.'),
  kind: z.enum(['step', 'trigger']).describe('Whether this is a regular step or a trigger.').optional(),
  dsl: StepDSLMetaSchema.describe('DSL configuration for flow-helper generation.').optional(),
}).strict();

export const DslEntrySchema = z.object({
  entry: z.string().describe('Path to the DSL type definition module.'),
  targets: z.array(z.enum(['monaco'])).describe('Editor targets for intellisense integration.'),
  prefix: z.string().describe('Namespace prefix for DSL symbols.').optional(),
  globals: z.record(z.string(), z.string()).describe('Global type mappings injected into the DSL scope.').optional(),
}).strict();

export const SeedEntryConfigSchema = z.object({
  path: z.string().describe('Directory containing seed source files.').optional(),
  seeder: z.string().describe('Custom seeder module path.').optional(),
  entityType: z.string().describe('EARS entity type for collection seeders.').optional(),
  lookupField: z.string().describe('Field used to deduplicate seeded entities.').optional(),
}).strict();

export const BootConfigSchema = z.object({
  earlySystem: z.string().describe('Built-in packs only. Ignored for external packs.').optional(),
  createDefaultSettings: z.string().describe('Module that ensures default settings exist.').optional(),
  hooks: z.string().describe('Module providing lifecycle hooks (e.g. shutdown).').optional(),
  seed: z.record(z.string(), z.union([z.string(), SeedEntryConfigSchema]))
    .describe('Seed data sources. Keys are seed type names, values are paths or config objects.').optional(),
  seedPolicy: z.object({
    skipAtBoot: z.array(z.string()).describe('Seed types to skip during boot.').optional(),
    skipAfterOnboarding: z.array(z.string()).describe('Seed types to skip after onboarding completes.').optional(),
  }).strict().describe('Controls which seed types to skip at boot or after onboarding.').optional(),
}).strict().describe('Boot sequence configuration.');

const SystemSchema = z.object({
  entry: z.string().describe('Path to the backend system module.'),
  outgoingEventsType: z.string().describe('TypeScript type name for outgoing events (used by codegen).').optional(),
  events: z.object({
    incoming: z.array(z.string()).describe('Event types this system listens for.').optional(),
    outgoing: z.array(z.string()).describe('Event types this system emits.').optional(),
  }).strict().describe('Event routing declarations.').optional(),
}).strict();

const PluginSchema = z.object({
  entry: z.string().describe('Path to the frontend plugin module.'),
  label: z.string().describe('Display name shown in the sidebar.'),
  icon: z.string().describe('Icon name from the icon library.'),
  isPinned: z.boolean().describe('Whether this plugin is pinned in the sidebar by default.').optional(),
}).strict();

/**
 * Feature IDs become identifiers in generated code (system exports, busId keys,
 * settings keys, emit targets), so they must be valid identifiers. Pack IDs only
 * appear as strings and stay kebab-case.
 */
export const FEATURE_ID_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

export const FeatureEntrySchema = z.object({
  id: z.string().regex(FEATURE_ID_PATTERN, 'Must start with a lowercase letter and contain only letters and digits (e.g. "notes", "calendarEvents")')
    .describe('Unique feature identifier. A lowercase-first identifier (letters and digits), used as a name in generated code.'),
  designation: z.string().describe('Links the system to an EARS designation.').optional(),
  settings: z.string().describe('Path to default settings file.').optional(),
  typesEntry: z.string().describe('Additional types to include in the generated type barrel.').optional(),
  earlySystem: z.boolean().describe('Built-in packs only. Ignored for external packs.').optional(),
  system: SystemSchema.describe('Backend system module.').optional(),
  plugin: PluginSchema.describe('Frontend plugin definition.').optional(),
  services: z.record(z.string(), z.string()).describe('Service modules. Keys are service names, values are source file paths.').optional(),
  contributions: z.string().describe('Built-in packs only. Ignored for external packs.').optional(),
}).strict();

export const PackPermissionSchema = z.enum(['ears', 'llm', 'filesystem', 'network', 'terminal']);

const PartitionPolicySchema = z.object({
  excludedEntityTypes: z.array(z.string()).describe('Entity types excluded from persistence (in-memory only).').optional(),
  secretEntityTypes: z.array(z.string()).describe('Entity types routed to the secrets store.').optional(),
}).strict().describe('Built-in packs only. Ignored for external packs.');

const EntityShapeSchema = z.object({
  source: z.string().describe('Source file path relative to pack root.'),
  type: z.string().describe('Exported TypeScript type name for the entity attributes.'),
}).strict();

const FEConfigSchema = z.object({
  entry: z.string().describe('Path to the frontend entry module.').optional(),
  tiptapPlugins: z.string().describe('Path to tiptap plugin registration module.').optional(),
  appExtensions: z.record(z.string(), z.string()).describe('Named app extensions. Keys are extension names, values are paths to Vue components.').optional(),
  styles: z.string().describe('Path to a CSS file to include in the frontend bundle.').optional(),
}).strict().describe('Frontend-specific pack configuration.');

const StepsSchema = z.object({
  register: z.string().describe('Path to the step registration barrel file.'),
  build: z.string().describe('Path to a module exporting build-time step definitions only (validate/compile/decompile, trigger facets; no runtime or FE imports). Bundled to build/steps.build.mjs for dependent packs.').optional(),
  definitions: z.array(StepEntrySchema).describe('Step definitions for codegen.'),
}).strict();

// ── Main manifest schema ────────────────────────────────────────────

export const ManifestSchema = z.object({
  $schema: z.string().describe('JSON Schema reference for editor validation.').optional(),
  $manifestVersion: z.literal(1).optional()
    .describe('Schema version. Enables future format evolution.'),
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Must be lowercase alphanumeric with hyphens')
    .describe('Unique pack identifier. Lowercase, alphanumeric with hyphens.'),
  name: z.string().min(1).describe('Human-readable pack name.'),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'Must be a semver version string')
    .describe('Semver version string.'),
  builtIn: z.boolean().describe('Whether this pack is bundled with the host app.').optional(),
  description: z.string().describe('Short description of the pack\'s purpose.').optional(),
  hostVersion: z.string().describe('Semver range for compatible host versions (e.g. ">=0.3.0").').optional(),
  license: z.string().describe('SPDX license identifier.').optional(),
  dependencies: z.record(z.string(), z.string())
    .describe('Other packs this pack depends on. Keys are pack IDs, values are semver ranges or file/URL references.').optional(),
  permissions: z.array(PackPermissionSchema).describe('Capabilities this pack requires from the host.').optional(),
  entities: z.record(z.string(), z.string())
    .describe('EARS entity types this pack registers. Keys are enum names, values are string identifiers.').optional(),
  relKinds: z.record(z.string(), z.string())
    .describe('EARS relation kinds this pack registers. Keys are enum names, values are string identifiers.').optional(),
  partitionPolicy: PartitionPolicySchema.optional(),
  entityShapes: z.record(z.string(), EntityShapeSchema)
    .describe('Maps entity type strings to their TypeScript attribute interfaces for type-safe EARS queries.').optional(),
  features: z.array(FeatureEntrySchema)
    .describe('Feature definitions. Each feature bundles a backend system, frontend plugin, services, and settings.').optional(),
  defaultPlugin: z.string().describe('ID of the feature to show by default when the app starts.').optional(),
  packServices: z.record(z.string(), z.string())
    .describe('Pack-level services not tied to a specific feature. Keys are service names, values are source file paths.').optional(),
  boot: BootConfigSchema.optional(),
  steps: StepsSchema.describe('Flow step definitions.').optional(),
  artifacts: z.string().describe('Path to artifact type registration module.').optional(),
  blocks: z.string().describe('Path to message block registration module.').optional(),
  migrations: z.string().describe('Path to migrations index module.').optional(),
  fe: FEConfigSchema.optional(),
  dsl: z.record(z.string(), DslEntrySchema).describe('DSL type definitions for Monaco editor intellisense.').optional(),
}).strict();
