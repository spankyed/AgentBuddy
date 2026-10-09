import { z } from 'zod';
import { SDK_ENTITIES, SDK_REL_KINDS } from '../types/sdk-entities.ts';
import { _reservedEntries } from '../types/reserved-names.ts';
import { HOST_PACK_ID } from '../ids/refs.ts';
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

/** Content keys compiled by the SDK's own compilers; they take a path, as a string or `{ path }` */
export const SPECIALTY_CONTENT_KEYS: readonly string[] = ['actions', 'prompts', 'flows'];

const ContentFieldSpecSchema = z.object({
  from: z.string().regex(/^(body|filename|path|frontmatter\.[\w-]+)$/, 'Must be "body", "filename", "path" or "frontmatter.<name>"')
    .describe('Where the value comes from: the markdown body, the display name of the file or directory, its relative path, or a frontmatter field.'),
  default: z.unknown().describe('Used when the source is absent. The string "filename" means the display name.').optional(),
  type: z.literal('string').describe('Coerce a present value to a string (YAML reads an unquoted 2024 as a number).').optional(),
}).strict();

const ContentTreeSpecSchema = z.object({
  branch: z.string().describe('A directory\'s own markdown file (e.g. "index.md"), giving the directory\'s frontmatter and body.').optional(),
  branchEntity: z.string().describe('The entity type directories become. Defaults to `entity`.').optional(),
  relKind: z.string().describe('The relation from a parent entity to each child. Defaults to "contains".').optional(),
}).strict();

const CONTENT_NAME = /^[a-z][a-z0-9-]*$/;

/** A relative directory: `/`-separated names, none of them `.` or `..` */
const MEDIA_PATH = /^(?!\.{1,2}(?:\/|$))(?!.*\/\.{1,2}(?:\/|$))[^/\\:]+(?:\/[^/\\:]+)*$/;

/** A format name in the pack's own `content.formats`, or `<dependency id>:<name>` */
const CONTENT_FORMAT_REF = /^(?:([a-z][a-z0-9-]*):)?([a-z][a-z0-9-]*)$/;

/** How a source becomes items: a built-in format or a compiler module, with the settings it uses */
export const ContentFormatSchema = z.object({
  format: z.enum(['markdown-tree', 'json']).describe('A built-in format: a directory of markdown, or a JSON array of records.').optional(),
  compiler: z.string().describe('A module in this pack whose default export compiles an entry\'s path into records. Used instead of "format".').optional(),
  entity: z.union([z.string(), z.array(z.string()).min(1)])
    .describe('The entity types the format\'s items are written as. Omitted, sources using it are compiled and never written (content.artifacts).').optional(),
  identity: z.array(z.string()).min(1)
    .describe('Fields matched to find an existing entity ("parent" = the tree parent). Ignored for entity types whose owning pack registers a content writer with "find".').optional(),
  tree: ContentTreeSpecSchema.describe('Walk subdirectories as parent entities.').optional(),
  fields: z.record(z.string(), ContentFieldSpecSchema).describe('Item fields for markdown-tree: field name → where its value comes from.').optional(),
  media: z.string().regex(MEDIA_PATH, 'Must be a relative directory under the entry\'s path, without "." or ".." segments')
    .describe('A directory under a source\'s path copied with the content; media/<file> links become media://<id>/<file>.').optional(),
}).strict().superRefine((format, ctx) => {
  if (!format.format === !format.compiler) ctx.addIssue({ code: 'custom', message: 'A content format needs "format" or "compiler", not both' });
  if (format.fields && format.format !== 'markdown-tree') ctx.addIssue({ code: 'custom', path: ['fields'], message: '"fields" applies only to format "markdown-tree"' });
  if (format.format === 'markdown-tree' && Array.isArray(format.entity)) {
    ctx.addIssue({ code: 'custom', path: ['entity'], message: 'Format "markdown-tree" writes one entity type: set "entity" to a string, and "tree.branchEntity" for directories' });
  }
});

/**
 * What an apply does about an item of this entry that the user has edited, and the line is whether editing
 * it meant adoption or customisation.
 *
 * **`theirs` is the default, because it is the quiet one.** Where the pack ships a starting point for the
 * user's own writing, their first edit makes the item theirs: never updated again, and never the subject of
 * a badge about their own prose. Where it ships something of the pack's that the user has customised — a
 * flow, an action, a prompt — they still want its bug fixes, so `offer` records what changed and lets them
 * decide. The dangerous option is the one someone has to type.
 *
 * **Neither value ever overwrites the user**, which is why the pair is named for whose the item is rather
 * than for what happens to their edit: under both, what they wrote stays. What differs is whether the pack
 * goes on offering its own version, and nothing here makes a second copy of anything.
 */
export const CONTENT_EDIT_POLICIES = ['theirs', 'offer'] as const;
export type ContentEditPolicy = (typeof CONTENT_EDIT_POLICIES)[number];

const ON_USER_EDIT = z.enum(CONTENT_EDIT_POLICIES)
  .describe('What an apply does about an item the user has edited: "theirs" leaves it theirs for good (the default), "offer" records the newer version so they can take it. Neither overwrites their edit.');

/** A `content.sources` entry: a source and the format that compiles it, a pack applier module, or both */
export const ContentSourceSchema = z.object({
  path: z.string().describe('Source directory or file, relative to the pack root.').optional(),
  format: z.string().regex(CONTENT_FORMAT_REF, 'Must be a content.formats name, or "<dependency id>:<name>"')
    .describe('The format compiling `path`: a name in this pack\'s content.formats, or "<dependency id>:<name>" for a dependency\'s.').optional(),
  applier: z.string().describe('A pack module exporting apply(ctx), used instead of the format applier. Alone, the build compiles nothing for the source and the module brings its own data; with "path" and "format", the module writes the compiled items.').optional(),
  onUserEdit: ON_USER_EDIT.optional(),
}).strict();

/** The fields a specialty key's object form may carry: it is the SDK that compiles it, so it names no format */
const SPECIALTY_FIELDS = new Set(['path', 'onUserEdit']);

// Content keys name files and folders in the compiled output (<key>.content.json, media/<key>) and generated identifiers
const CONTENT_KEY_SCHEMA = z.string().regex(CONTENT_NAME, 'Must be a lowercase letter, then lowercase letters, digits and hyphens');

const ContentSourcesSchema = z.record(CONTENT_KEY_SCHEMA, z.union([z.string(), ContentSourceSchema])).superRefine((sources, ctx) => {
  for (const [key, entry] of Object.entries(sources)) {
    if (SPECIALTY_CONTENT_KEYS.includes(key)) {
      if (typeof entry === 'object' && (!entry.path || Object.keys(entry).some((field) => !SPECIALTY_FIELDS.has(field)))) {
        ctx.addIssue({ code: 'custom', path: [key], message: `"${key}" is compiled by the SDK: give its source as a path or { "path": …, "onUserEdit"?: … }` });
      }
    } else if (typeof entry === 'string') {
      ctx.addIssue({ code: 'custom', path: [key], message: `Unknown content key "${key}": only ${SPECIALTY_CONTENT_KEYS.join(', ')} take a path; other sources are { "path", "format" } or { "applier" }` });
    } else if ((entry.path === undefined) !== (entry.format === undefined) || (!entry.path && !entry.applier)) {
      ctx.addIssue({ code: 'custom', path: [key], message: `Content "${key}" must be { "path", "format" }, optionally with "applier", or { "applier" }` });
    }
  }
});

/**
 * A compiled artefact the pack reads back itself, never written to the database: the build produces
 * `<key>.content.json` and the pack's own code reads it.
 *
 * It is a key of its own because the alternative was a `content.sources` entry whose format declared no
 * entity: compiled, indexed, given an applier that could only find nothing to do, and a standing
 * contradiction with "every source a pack declares is applied". The format it names must declare no
 * `entity`, which is the whole of what makes it an artefact rather than content.
 */
const ContentArtifactsSchema = z.record(CONTENT_KEY_SCHEMA, ContentSourceSchema).superRefine((artifacts, ctx) => {
  for (const [key, entry] of Object.entries(artifacts)) {
    if (!entry.path || !entry.format || entry.applier) {
      ctx.addIssue({ code: 'custom', path: [key], message: `Artifact "${key}" must be { "path", "format" }: it is compiled and never written, so it takes no applier` });
    }
    // Nothing of an artefact reaches the database, so there is no edit of the user's for a policy to be about
    if (entry.onUserEdit) {
      ctx.addIssue({ code: 'custom', path: [key], message: `Artifact "${key}" is never written, so "onUserEdit" decides nothing: drop it` });
    }
  }
});


const SystemSchema = z.object({
  entry: z.string().describe('Path to the backend system module.'),
  contract: z.string().describe('"path#exportName" of this system\'s contract: a declared type holding its context and its incoming, internal and outgoing events (SystemContract, @abuddy/sdk/framework). It lives in a leaf module of its own (be/contract.ts), so codegen reads it without running anything. Omit it for a system that sends no events.').optional(),
  events: z.object({
    incoming: z.array(z.string()).describe('Event types this system listens for.').optional(),
  }).strict().describe('Event routing declarations.').optional(),
}).strict();

const PluginSchema = z.object({
  entry: z.string().describe('Path to the frontend plugin module, which default-exports the Plugin (its id, label, icon and isPinned).'),
  contract: z.string().describe('"path#exportName" of this plugin\'s contract: a declared type holding the state it publishes and the inbox other plugins may send to (PluginInbox, @abuddy/sdk/fe). It lives in a leaf module of its own (fe/contract.ts), which the plugin\'s machine does not import, so codegen can read it without resolving the machine. Omit it for a plugin that publishes nothing: it still receives its own feature\'s system events.').optional(),
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

export const ContentConfigSchema = z.object({
  sources: ContentSourcesSchema
    .describe('Content this pack writes into the database. Keys name the content; the specialty keys (actions, prompts, flows) take a path, other keys an entry object.').optional(),
  artifacts: ContentArtifactsSchema
    .describe('Compiled artefacts the pack reads back itself, never written to the database. Each names a format declaring no entity.').optional(),
  formats: z.record(CONTENT_KEY_SCHEMA, ContentFormatSchema)
    .describe('Named formats that turn a source into items. A content source names one; a dependent pack names one of these as "<this pack id>:<name>".').optional(),
  writers: z.record(z.string(), ExportTargetSchema)
    .describe('How one entity type this pack declares is found, created, updated and removed when content is written as it ("path#exportName" of a ContentWriter object). Any pack writing that entity type goes through them.').optional(),
}).strict().describe("A pack's content: what it ships, how it is compiled, and how it reaches the database.");

export const BootConfigSchema = z.object({
  hooks: z.string().describe('Module exporting lifecycle hooks: onInit (after EARS hydration, before migrations and content) and onShutdown (when the pack\'s backend stops).').optional(),
}).strict().describe('Boot sequence configuration.');

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
  system: SystemSchema.describe('Backend system module.').optional(),
  plugin: PluginSchema.describe('Frontend plugin definition.').optional(),
  services: ServicesSchema
    .describe('Services. Keys are service names on `services`, values are "path#exportName" of the service object (an object literal or a class instance, not a factory) in a source file.').optional(),
  repositories: z.record(IdentifierSchema, ExportTargetSchema)
    .describe('Repository objects. Keys are repository names on `repository` (from #generated/repository), values are "path#exportName" of the object in a source file.').optional(),
  references: z.string().describe('Path to a module declaring which of this feature\'s things are linkable from an editor (protocol, category, icon, navigate). Built-in packs only. Ignored for external packs.').optional(),
}).strict();

export const PackPermissionSchema = z.enum(['ears', 'llm', 'filesystem', 'network', 'terminal']);

const EntityShapeSchema = z.object({
  source: z.string().describe('Source file path relative to pack root.'),
  type: z.string().describe('Exported TypeScript type name for the entity attributes.'),
}).strict();

/**
 * How the pack is built. These are settings no part of the app reads — unlike `entities` or `features`,
 * which the host loads at boot — so what belongs here is anything that changes only what `abuddy build`
 * produces or how long it takes.
 */
const BuildConfigSchema = z.object({
  opaqueDeps: z.array(z.string()).describe('Dependencies the frontend bundle includes whole instead of tree-shaking, by package name. For a prebuilt bundle — a dependency shipped as one already-minified file, or compiled from another language — where the shake removes almost nothing and walking it is most of the build. Each ships as it is, so nothing inside it is dead-code eliminated.').optional(),
}).strict().describe('Build-time configuration: settings that change what the build produces, never what the app loads.');

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
  entityShapes: z.record(z.string(), EntityShapeSchema)
    .describe('Maps entity type strings to their TypeScript attribute interfaces for type-safe EARS queries.').optional(),
  features: z.array(FeatureEntrySchema)
    .describe('Feature definitions. Each feature bundles a backend system, frontend plugin, services, and settings.').optional(),
  packServices: ServicesSchema
    .describe('Pack-level services not tied to a specific feature. Keys are service names on `services`, values are "path#exportName" of the service object (an object literal or a class instance, not a factory) in a source file.').optional(),
  help: ExportTargetSchema
    .describe('Help entries this pack answers with, listed under Help in the app\'s Settings view. "path#exportName" of a function returning them; it is called the first time the list is read, so a pack may read its compiled content then.').optional(),
  settingsSections: ExportTargetSchema
    .describe('Sections of the app settings this pack owns, with their defaults, beside the "plugins" section the app keeps itself. "path#exportName" of a function returning them; it is called the first time the defaults are read, so a pack can read its compiled content then.').optional(),
  commands: z.array(CommandEntrySchema)
    .describe('Slash commands this pack adds to the chat. Sending one fires a `user.command` event the pack\'s flows handle; a name must be unique across the app.').optional(),
  boot: BootConfigSchema.optional(),
  content: ContentConfigSchema.optional(),
  steps: StepsSchema.describe('Flow step definitions.').optional(),
  artifacts: z.string().describe('Path to artifact type registration module.').optional(),
  blocks: z.string().describe('Path to message block registration module.').optional(),
  migrations: z.string().describe('Path to migrations index module.').optional(),
  fe: FEConfigSchema.optional(),
  build: BuildConfigSchema.optional(),
  dsl: z.record(z.string(), DslEntrySchema).describe('DSL type definitions for Monaco editor intellisense.').optional(),
}).strict().superRefine((manifest, ctx) => {
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

  // Both kinds of entry name a format, and both are checked against the same two places
  for (const section of ['sources', 'artifacts'] as const) {
    for (const [key, entry] of Object.entries(manifest.content?.[section] ?? {})) {
      if (typeof entry !== 'object' || !entry.format) continue;
      const [, pack, name] = CONTENT_FORMAT_REF.exec(entry.format) ?? [];
      if (!name) continue;
      const at = ['content', section, key, 'format'];
      if (pack === undefined && !manifest.content?.formats?.[name]) {
        ctx.addIssue({ code: 'custom', path: at, message: `Content "${key}": no format "${name}" in content.formats` });
      } else if (pack !== undefined && !(pack in (manifest.dependencies ?? {}))) {
        ctx.addIssue({ code: 'custom', path: at, message: `Content "${key}": format "${entry.format}" names "${pack}", which isn't a dependency` });
      }
    }
  }
  // A key is a file name in the compiled output, so the two sections cannot share one
  for (const key of Object.keys(manifest.content?.artifacts ?? {})) {
    if (key in (manifest.content?.sources ?? {})) {
      ctx.addIssue({ code: 'custom', path: ['content', 'artifacts', key], message: `"${key}" is both a content source and an artifact: they compile to the same file` });
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
  for (const entity of Object.keys(manifest.content?.writers ?? {})) {
    if (!declared.has(entity)) {
      ctx.addIssue({ code: 'custom', path: ['content', 'writers', entity], message: `A content writer for "${entity}": only entity types this pack declares in "entities" can have one` });
    }
  }
});
