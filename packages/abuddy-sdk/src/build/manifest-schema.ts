import { z } from 'zod';
import { SDK_ENTITIES, SDK_REL_KINDS } from '../types/sdk-entities.ts';

/** Rejects a pack's declaration of a name or value the SDK owns */
const notSdkOwned = (owned: Record<string, string>, field: string) => ({
  check: (declared: Record<string, string>) =>
    Object.entries(declared).every(([key, value]) => !(key in owned) && !Object.values(owned).includes(value)),
  message: `${Object.keys(owned).join(', ')} are defined by the SDK and available to every pack; remove them from ${field}`,
});
const sdkEntities = notSdkOwned(SDK_ENTITIES, 'entities');
const sdkRelKinds = notSdkOwned(SDK_REL_KINDS, 'relKinds');

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
  inline: z.array(z.string()).describe('Packages whose declarations are bundled into the editor definitions, besides @abuddy/* and the pack\'s own modules. The editor loads no node_modules, so a type it needs from another package belongs here.').optional(),
}).strict();

/** Seed keys compiled and seeded by the SDK's own compilers; they take a path, as a string or `{ path }` */
export const SPECIALTY_SEED_KEYS: readonly string[] = ['actions', 'prompts', 'flows', 'settings'];

const SeedFieldSpecSchema = z.object({
  from: z.string().regex(/^(body|filename|path|frontmatter\.[\w-]+)$/, 'Must be "body", "filename", "path" or "frontmatter.<name>"')
    .describe('Where the value comes from: the markdown body, the display name of the file or directory, its relative path, or a frontmatter field.'),
  default: z.unknown().describe('Used when the source is absent. The string "filename" means the display name.').optional(),
  type: z.literal('string').describe('Coerce a present value to a string (YAML reads an unquoted 2024 as a number).').optional(),
}).strict();

const SeedTreeSpecSchema = z.object({
  branch: z.string().describe('A directory\'s own markdown file (e.g. "index.md"), giving the directory\'s frontmatter and body.').optional(),
  branchEntity: z.string().describe('The entity type directories seed. Defaults to `entity`.').optional(),
  relKind: z.string().describe('The relation from a parent row to each child row. Defaults to "contains".').optional(),
}).strict();

const SEED_FORMAT_NAME = /^[a-z][a-z0-9-]*$/;

/** A format name in the pack's own `seedFormats`, or `<dependency id>:<name>` */
const SEED_FORMAT_REF = /^(?:([a-z][a-z0-9-]*):)?([a-z][a-z0-9-]*)$/;

/** How a source becomes records: a built-in format or a compiler module, with the settings it uses */
export const SeedFormatSchema = z.object({
  format: z.enum(['markdown-tree', 'json']).describe('A built-in format: a directory of markdown, or a JSON array of records.').optional(),
  compiler: z.string().describe('A module in this pack whose default export compiles an entry\'s path into records. Used instead of "format".').optional(),
  entity: z.union([z.string(), z.array(z.string()).min(1)])
    .describe('The entity types the format\'s records seed. Omitted, entries using it are compiled but not seeded.').optional(),
  identity: z.array(z.string()).min(1)
    .describe('Fields matched to find an existing row ("parent" = the tree parent). Ignored for entity types whose owning pack registers a find seed hook.').optional(),
  tree: SeedTreeSpecSchema.describe('Walk subdirectories as parent rows.').optional(),
  fields: z.record(z.string(), SeedFieldSpecSchema).describe('Record fields for markdown-tree: field name → where its value comes from.').optional(),
  media: z.string().describe('A directory under an entry\'s path copied with the seeds; media/<file> links become media://<id>/<file>.').optional(),
}).strict().superRefine((format, ctx) => {
  if (!format.format === !format.compiler) ctx.addIssue({ code: 'custom', message: 'A seed format needs "format" or "compiler", not both' });
  if (format.fields && format.format !== 'markdown-tree') ctx.addIssue({ code: 'custom', path: ['fields'], message: '"fields" applies only to format "markdown-tree"' });
});

/** A `boot.seed` entry: a source and the format that compiles it, or a pack seeder module */
export const SeedEntryConfigSchema = z.object({
  path: z.string().describe('Source directory or file, relative to the pack root.').optional(),
  format: z.string().regex(SEED_FORMAT_REF, 'Must be a seedFormats name, or "<dependency id>:<name>"')
    .describe('The format compiling `path`: a name in this pack\'s seedFormats, or "<dependency id>:<name>" for a dependency\'s.').optional(),
  seeder: z.string().describe('A pack module exporting seed(ctx), used instead of a format and the generic seeder.').optional(),
}).strict();

const SeedSectionSchema = z.record(z.string(), z.union([z.string(), SeedEntryConfigSchema])).superRefine((seed, ctx) => {
  for (const [key, entry] of Object.entries(seed)) {
    if (SPECIALTY_SEED_KEYS.includes(key)) {
      if (typeof entry === 'object' && (!entry.path || Object.keys(entry).some((field) => field !== 'path'))) {
        ctx.addIssue({ code: 'custom', path: [key], message: `"${key}" is compiled by the SDK: give its source as a path or { "path": … }` });
      }
    } else if (typeof entry === 'string') {
      ctx.addIssue({ code: 'custom', path: [key], message: `Unknown seed key "${key}": only ${SPECIALTY_SEED_KEYS.join(', ')} take a path; other seeds are { "path", "format" } or { "seeder" }` });
    } else if (entry.seeder ? entry.path !== undefined || entry.format !== undefined : !entry.path || !entry.format) {
      ctx.addIssue({ code: 'custom', path: [key], message: `Seed "${key}" must be { "path", "format" } or { "seeder" }` });
    }
  }
});

export const BootConfigSchema = z.object({
  hooks: z.string().describe('Module exporting lifecycle hooks: onInit (after EARS hydration, before migrations and seeds) and onShutdown (when the pack\'s backend stops).').optional(),
  seed: SeedSectionSchema
    .describe('Seed data sources. Keys are seed names; the specialty keys (actions, prompts, flows, settings) take a path, other keys an entry object.').optional(),
  seedPolicy: z.object({
    skipAtBoot: z.array(z.string()).describe('Seed types to skip during boot.').optional(),
    skipAfterOnboarding: z.array(z.string()).describe('Seed types to skip after onboarding completes.').optional(),
  }).strict().describe('Controls which seed types to skip at boot or after onboarding.').optional(),
}).strict().describe('Boot sequence configuration.');

const SystemSchema = z.object({
  entry: z.string().describe('Path to the backend system module.'),
  outgoingEventsType: z.string().describe('TypeScript type name for outgoing events (used by codegen).').optional(),
  sendsTo: z.array(z.string()).describe('Plugins this system sends events to besides its own feature\'s: other features of this pack, plugins of its dependencies, or host plugins ("application"). Each receiving plugin\'s generated event type includes this system\'s outgoing events.').optional(),
  events: z.object({
    incoming: z.array(z.string()).describe('Event types this system listens for.').optional(),
  }).strict().describe('Event routing declarations.').optional(),
}).strict();

const PluginSchema = z.object({
  entry: z.string().describe('Path to the frontend plugin module, which default-exports the Plugin (its id, label, icon and isPinned).'),
}).strict();

/**
 * Feature IDs become identifiers in generated code (system exports, busId keys,
 * settings keys, emit targets), so they must be valid identifiers. Pack IDs only
 * appear as strings and stay kebab-case.
 */
export const FEATURE_ID_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

const IdentifierSchema = z.string().regex(/^[A-Za-z_$][\w$]*$/, 'Must be an identifier');

/** A named export of a pack source file */
const ExportTargetSchema = z.string().regex(/^[^#]+#[A-Za-z_$][\w$]*$/, 'Must be "path#exportName"');

const ServicesSchema = z.record(IdentifierSchema, ExportTargetSchema);

export const FeatureEntrySchema = z.object({
  id: z.string().regex(FEATURE_ID_PATTERN, 'Must start with a lowercase letter and contain only letters and digits (e.g. "notes", "calendarEvents")')
    .describe('Unique feature identifier. A lowercase-first identifier (letters and digits), used as a name in generated code.'),
  designation: z.string().describe('Links the system to an EARS designation.').optional(),
  settings: z.string().describe('Path to default settings file.').optional(),
  typesEntry: z.string().describe('Additional types to include in the generated type barrel.').optional(),
  earlySystem: z.boolean().describe('Start this feature\'s system before EARS hydration. Built-in packs only.').optional(),
  system: SystemSchema.describe('Backend system module.').optional(),
  plugin: PluginSchema.describe('Frontend plugin definition.').optional(),
  services: ServicesSchema
    .describe('Services. Keys are service names on `services`, values are "path#exportName" of the service object (an object literal or a class instance, not a factory) in a source file.').optional(),
  repositories: z.record(IdentifierSchema, ExportTargetSchema)
    .describe('Repository objects. Keys are repository names on `repository` (from #generated/repository), values are "path#exportName" of the object in a source file.').optional(),
  contributions: z.string().describe('Built-in packs only. Ignored for external packs.').optional(),
}).strict();

export const PackPermissionSchema = z.enum(['ears', 'llm', 'filesystem', 'network', 'terminal']);

const PartitionPolicySchema = z.object({
  excludedEntityTypes: z.array(z.string()).describe('Entity types excluded from persistence (in-memory only).').optional(),
}).strict().describe('Built-in packs only. Ignored for external packs.');

const EntityShapeSchema = z.object({
  source: z.string().describe('Source file path relative to pack root.'),
  type: z.string().describe('Exported TypeScript type name for the entity attributes.'),
}).strict();

const FEConfigSchema = z.object({
  tiptapPlugins: z.string().describe('Path to tiptap plugin registration module.').optional(),
  appExtensions: z.record(z.string(), z.string()).describe('Named app extensions. Keys are extension names, values are paths to Vue components.').optional(),
  bundleUi: z.boolean().describe('Bundle a copy of @abuddy/ui into the pack instead of using the host app\'s. All of @abuddy/ui is bundled, so the pack never mixes the two.').optional(),
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
    .refine(sdkEntities.check, { message: sdkEntities.message })
    .describe(`EARS entity types this pack registers. Keys are enum names, values are string identifiers. The SDK defines ${Object.keys(SDK_ENTITIES).join(', ')}.`).optional(),
  relKinds: z.record(z.string(), z.string())
    .refine(sdkRelKinds.check, { message: sdkRelKinds.message })
    .describe(`EARS relation kinds this pack registers. Keys are enum names, values are string identifiers. The SDK defines ${Object.keys(SDK_REL_KINDS).join(', ')}.`).optional(),
  partitionPolicy: PartitionPolicySchema.optional(),
  entityShapes: z.record(z.string(), EntityShapeSchema)
    .describe('Maps entity type strings to their TypeScript attribute interfaces for type-safe EARS queries.').optional(),
  features: z.array(FeatureEntrySchema)
    .describe('Feature definitions. Each feature bundles a backend system, frontend plugin, services, and settings.').optional(),
  defaultPlugin: z.string().describe('ID of the feature to show by default when the app starts.').optional(),
  packServices: ServicesSchema
    .describe('Pack-level services not tied to a specific feature. Keys are service names on `services`, values are "path#exportName" of the service object (an object literal or a class instance, not a factory) in a source file.').optional(),
  boot: BootConfigSchema.optional(),
  steps: StepsSchema.describe('Flow step definitions.').optional(),
  artifacts: z.string().describe('Path to artifact type registration module.').optional(),
  blocks: z.string().describe('Path to message block registration module.').optional(),
  migrations: z.string().describe('Path to migrations index module.').optional(),
  fe: FEConfigSchema.optional(),
  dsl: z.record(z.string(), DslEntrySchema).describe('DSL type definitions for Monaco editor intellisense.').optional(),
  seedFormats: z.record(z.string().regex(SEED_FORMAT_NAME, 'Must be lowercase alphanumeric with hyphens'), SeedFormatSchema)
    .describe('Named seed formats: how a source becomes records. boot.seed entries name one; dependents name them as "<pack id>:<name>".').optional(),
  seedHooks: z.record(z.string(), ExportTargetSchema)
    .describe('Seed hooks for entity types this pack declares: entity type → "path#exportName" of a SeedHooks object. Any pack seeding the type uses them.').optional(),
}).strict().superRefine((manifest, ctx) => {
  if (!manifest.builtIn && manifest.boot?.seed?.settings !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['boot', 'seed', 'settings'], message: 'The "settings" seed holds the app\'s own defaults, so only built-in packs have one; declare a feature\'s default settings with features[].settings' });
  }
  if (!manifest.builtIn) {
    manifest.features?.forEach((feature, index) => {
      if (feature.earlySystem) ctx.addIssue({ code: 'custom', path: ['features', index, 'earlySystem'], message: 'An early system starts before EARS hydration, before external packs load, so only built-in packs allowed to have one' });
    });
  }
  for (const [key, entry] of Object.entries(manifest.boot?.seed ?? {})) {
    if (typeof entry !== 'object' || !entry.format) continue;
    const [, pack, name] = SEED_FORMAT_REF.exec(entry.format) ?? [];
    if (!name) continue;
    if (pack === undefined && !manifest.seedFormats?.[name]) {
      ctx.addIssue({ code: 'custom', path: ['boot', 'seed', key, 'format'], message: `Seed "${key}": no format "${name}" in seedFormats` });
    } else if (pack !== undefined && !(pack in (manifest.dependencies ?? {}))) {
      ctx.addIssue({ code: 'custom', path: ['boot', 'seed', key, 'format'], message: `Seed "${key}": format "${entry.format}" names "${pack}", which isn't a dependency` });
    }
  }
  const declared = new Set(Object.values(manifest.entities ?? {}));
  for (const entity of Object.keys(manifest.seedHooks ?? {})) {
    if (!declared.has(entity)) {
      ctx.addIssue({ code: 'custom', path: ['seedHooks', entity], message: `Seed hooks for "${entity}": only entity types this pack declares in "entities" can have seed hooks` });
    }
  }
});
