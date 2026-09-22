import { z } from 'zod';
import { SDK_ENTITIES, SDK_REL_KINDS } from '../types/sdk-entities.ts';
import { _reservedEntries } from '../types/reserved-names.ts';
import { HOST_PACK_ID } from '../ids/system-ids.ts';
import { FEATURE_ID_PATTERN, PACK_ID_PATTERN } from '../ids/refs.ts';

export { FEATURE_ID_PATTERN };

/** Rejects a pack's entries that use a name or value the SDK owns, naming each */
const notSdkOwned = (owned: Record<string, string>) => (declared: Record<string, string>, ctx: z.RefinementCtx) => {
  const taken = _reservedEntries(declared, owned);
  if (taken.length === 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `${taken.join(', ')} ${taken.length === 1 ? 'is' : 'are'} defined by the SDK and available to every pack: remove ${taken.length === 1 ? 'it' : 'them'}`,
  });
};

/** An entity's key is its type name: `entities: { Memo: "Memo" }` */
const keysAreTypeNames = (declared: Record<string, string>, ctx: z.RefinementCtx) => {
  for (const [key, value] of Object.entries(declared)) {
    if (key !== value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `an entity's key must be its type name: use "${value}": "${value}"` });
    }
  }
};

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
export const SPECIALTY_SEED_KEYS: readonly string[] = ['actions', 'prompts', 'flows'];

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

/** A relative directory: `/`-separated names, none of them `.` or `..` */
const MEDIA_PATH = /^(?!\.{1,2}(?:\/|$))(?!.*\/\.{1,2}(?:\/|$))[^/\\:]+(?:\/[^/\\:]+)*$/;

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
  media: z.string().regex(MEDIA_PATH, 'Must be a relative directory under the entry\'s path, without "." or ".." segments')
    .describe('A directory under an entry\'s path copied with the seeds; media/<file> links become media://<id>/<file>.').optional(),
}).strict().superRefine((format, ctx) => {
  if (!format.format === !format.compiler) ctx.addIssue({ code: 'custom', message: 'A seed format needs "format" or "compiler", not both' });
  if (format.fields && format.format !== 'markdown-tree') ctx.addIssue({ code: 'custom', path: ['fields'], message: '"fields" applies only to format "markdown-tree"' });
  if (format.format === 'markdown-tree' && Array.isArray(format.entity)) {
    ctx.addIssue({ code: 'custom', path: ['entity'], message: 'Format "markdown-tree" seeds one entity type: set "entity" to a string, and "tree.branchEntity" for directories' });
  }
});

/** A `boot.seed` entry: a source and the format that compiles it, a pack seeder module, or both */
export const SeedEntryConfigSchema = z.object({
  path: z.string().describe('Source directory or file, relative to the pack root.').optional(),
  format: z.string().regex(SEED_FORMAT_REF, 'Must be a seedFormats name, or "<dependency id>:<name>"')
    .describe('The format compiling `path`: a name in this pack\'s seedFormats, or "<dependency id>:<name>" for a dependency\'s.').optional(),
  seeder: z.string().describe('A pack module exporting seed(ctx), used instead of the generic seeder. Alone, the build compiles nothing for the entry and the module brings its own data; with "path" and "format", the module seeds the compiled records.').optional(),
}).strict();

// Seed keys name files and folders in the compiled output (<key>.seed.json, media/<key>) and generated identifiers
const SeedSectionSchema = z.record(z.string().regex(SEED_FORMAT_NAME, 'Must be a lowercase letter, then lowercase letters, digits and hyphens'), z.union([z.string(), SeedEntryConfigSchema])).superRefine((seed, ctx) => {
  for (const [key, entry] of Object.entries(seed)) {
    if (SPECIALTY_SEED_KEYS.includes(key)) {
      if (typeof entry === 'object' && (!entry.path || Object.keys(entry).some((field) => field !== 'path'))) {
        ctx.addIssue({ code: 'custom', path: [key], message: `"${key}" is compiled by the SDK: give its source as a path or { "path": … }` });
      }
    } else if (typeof entry === 'string') {
      ctx.addIssue({ code: 'custom', path: [key], message: `Unknown seed key "${key}": only ${SPECIALTY_SEED_KEYS.join(', ')} take a path; other seeds are { "path", "format" } or { "seeder" }` });
    } else if ((entry.path === undefined) !== (entry.format === undefined) || (!entry.path && !entry.seeder)) {
      ctx.addIssue({ code: 'custom', path: [key], message: `Seed "${key}" must be { "path", "format" }, optionally with "seeder", or { "seeder" }` });
    }
  }
});

export const BootConfigSchema = z.object({
  hooks: z.string().describe('Module exporting lifecycle hooks: onInit (after EARS hydration, before migrations and seeds) and onShutdown (when the pack\'s backend stops).').optional(),
  seed: SeedSectionSchema
    .describe('Seed data sources. Keys are seed names; the specialty keys (actions, prompts, flows) take a path, other keys an entry object.').optional(),
  seedPolicy: z.object({
    skipAtBoot: z.array(z.string()).describe('Seed types to skip during boot.').optional(),
    skipAfterOnboarding: z.array(z.string()).describe('Seed types to skip after onboarding completes.').optional(),
  }).strict().describe('Controls which seed types to skip at boot or after onboarding.').optional(),
}).strict().describe('Boot sequence configuration.');

const SystemSchema = z.object({
  entry: z.string().describe('Path to the backend system module.'),
  sendsTo: z.array(z.string()).describe('Plugins this system sends events to besides its own feature\'s, named as code names them: other features of this pack that have a plugin (by feature id), a dependency\'s plugins ("<packId>/<featureId>"), or host plugins ("host/application"). Another feature of this pack gains this system\'s outgoing events; a dependency\'s plugin or a host plugin keeps the events its own owner declares it receives, and naming it here is what makes it sendable at all.').optional(),
  events: z.object({
    incoming: z.array(z.string()).describe('Event types this system listens for.').optional(),
  }).strict().describe('Event routing declarations.').optional(),
}).strict();

const PluginSchema = z.object({
  entry: z.string().describe('Path to the frontend plugin module, which default-exports the Plugin (its id, label, icon and isPinned).'),
  default: z.boolean().describe('Show this plugin when the app starts. At most one of a pack\'s features may claim it; the first pack to register one across the app wins.').optional(),
}).strict();


/** Names a feature id can't take: reserved words, since a feature id becomes an identifier in generated code */
const RESERVED_FEATURE_IDS = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
  'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements', 'import', 'in',
  'instanceof', 'interface', 'let', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'static',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  'arguments', 'eval',
]);

const IdentifierSchema = z.string().regex(/^[A-Za-z_$][\w$]*$/, 'Must be an identifier');

/** A named export of a pack source file */
const ExportTargetSchema = z.string().regex(/^[^#]+#[A-Za-z_$][\w$]*$/, 'Must be "path#exportName"');

const ServicesSchema = z.record(IdentifierSchema, ExportTargetSchema);

/** A slash command a pack declares: the chat lists it, and a `user.command` event carries its name */
export const CommandEntrySchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Must be a lowercase letter, then lowercase letters, digits and hyphens')
    .describe('The command as typed after the "/", without it.'),
  placeholder: z.string().min(1).describe('What the chat shows after the command: the argument it takes, or what it does.'),
}).strict();

export const FeatureEntrySchema = z.object({
  id: z.string().regex(FEATURE_ID_PATTERN, 'Must start with a lowercase letter and contain only letters and digits (e.g. "notes", "calendarEvents")')
    .refine((id) => !RESERVED_FEATURE_IDS.has(id), (id) => ({ message: `"${id}" is reserved in generated code: pick another feature id` }))
    .describe('Unique feature identifier. A lowercase-first identifier (letters and digits), used as a name in generated code; not a reserved word.'),
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
  references: z.string().describe('Path to a module declaring which of this feature\'s things are linkable from an editor (protocol, category, icon, navigate). Built-in packs only. Ignored for external packs.').optional(),
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
  appExtensions: z.record(IdentifierSchema, z.string()).describe('Named app extensions. Keys are extension names (identifiers), values are paths to Vue components.').optional(),
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
  id: z.string().regex(PACK_ID_PATTERN, 'Must be lowercase alphanumeric with hyphens')
    .refine((id) => id !== HOST_PACK_ID, { message: `"${HOST_PACK_ID}" is the app's own pack id: pick another` })
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
    .superRefine(notSdkOwned(SDK_ENTITIES))
    .superRefine(keysAreTypeNames)
    .describe(`EARS entity types this pack registers, each key equal to its value, the type name ({ "Memo": "Memo" }). The SDK defines ${Object.keys(SDK_ENTITIES).join(', ')}.`).optional(),
  relKinds: z.record(z.string(), z.string())
    .superRefine(notSdkOwned(SDK_REL_KINDS))
    .describe(`EARS relation kinds this pack registers. Keys are enum names, values are string identifiers. The SDK defines ${Object.keys(SDK_REL_KINDS).join(', ')}.`).optional(),
  partitionPolicy: PartitionPolicySchema.optional(),
  entityShapes: z.record(z.string(), EntityShapeSchema)
    .describe('Maps entity type strings to their TypeScript attribute interfaces for type-safe EARS queries.').optional(),
  features: z.array(FeatureEntrySchema)
    .describe('Feature definitions. Each feature bundles a backend system, frontend plugin, services, and settings.').optional(),
  packServices: ServicesSchema
    .describe('Pack-level services not tied to a specific feature. Keys are service names on `services`, values are "path#exportName" of the service object (an object literal or a class instance, not a factory) in a source file.').optional(),
  commands: z.array(CommandEntrySchema)
    .describe('Slash commands this pack adds to the chat. Sending one fires a `user.command` event the pack\'s flows handle; a name must be unique across the app.').optional(),
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
  if (!manifest.builtIn) {
    manifest.features?.forEach((feature, index) => {
      if (feature.earlySystem) ctx.addIssue({ code: 'custom', path: ['features', index, 'earlySystem'], message: 'An early system starts before EARS hydration, before external packs load, so only built-in packs allowed to have one' });
    });
  }
  // Which plugin opens first is one plugin's annotation, so a pack naming two has said nothing
  const claimedDefault = (manifest.features ?? []).filter((feature) => feature.plugin?.default);
  if (claimedDefault.length > 1) {
    const at = (manifest.features ?? []).indexOf(claimedDefault[1]!);
    ctx.addIssue({
      code: 'custom',
      path: ['features', at, 'plugin', 'default'],
      message: `Two features claim the default plugin: "${claimedDefault[0]!.id}" and "${claimedDefault[1]!.id}". Only one may.`,
    });
  }

  // A send to one of this pack's own features can only arrive at a plugin; a dependency's or a host
  // plugin isn't in this manifest, so codegen checks those against the dependencies' snapshots
  const ownFeatureIds = new Set((manifest.features ?? []).map((feature) => feature.id));
  const ownPluginIds = new Set((manifest.features ?? []).filter((feature) => feature.plugin).map((feature) => feature.id));
  manifest.features?.forEach((feature, index) => {
    feature.system?.sendsTo?.forEach((target, targetIndex) => {
      if (ownFeatureIds.has(target) && !ownPluginIds.has(target)) {
        ctx.addIssue({
          code: 'custom',
          path: ['features', index, 'system', 'sendsTo', targetIndex],
          message: `Feature "${feature.id}": system.sendsTo names "${target}", a feature of this pack with no plugin, so nothing can receive the events: give "${target}" a plugin or remove it from sendsTo`,
        });
      }
    });
  });
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
  // The chat lists each name once, so a pack declares it once
  const commandNames = new Set<string>();
  manifest.commands?.forEach((command, index) => {
    if (commandNames.has(command.name)) {
      ctx.addIssue({ code: 'custom', path: ['commands', index, 'name'], message: `Command "${command.name}" is declared twice` });
      return;
    }
    commandNames.add(command.name);
  });
  const declared = new Set(Object.values(manifest.entities ?? {}));
  for (const entity of Object.keys(manifest.seedHooks ?? {})) {
    if (!declared.has(entity)) {
      ctx.addIssue({ code: 'custom', path: ['seedHooks', entity], message: `Seed hooks for "${entity}": only entity types this pack declares in "entities" can have seed hooks` });
    }
  }
});
