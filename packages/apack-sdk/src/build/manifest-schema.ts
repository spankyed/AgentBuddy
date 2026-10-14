import type { PackLifecycleDeclaration } from '../framework/lifecycle-declaration.ts';
export { LIFECYCLE_HOOK_NAMES } from '../framework/lifecycle-declaration.ts';
import { _packEntities, _packEntityTypes, _packRelationTypes, _RELATION_WIRE_PATTERN } from '../framework/data-declaration.ts';
import { _MODULE_REFERENCE_PATTERN } from '../framework/module-reference.ts';
import { z } from 'zod';
import { SDK_ENTITIES, SDK_REL_KINDS } from '../types/sdk-entities.ts';
import { _reservedEntries } from '../types/reserved-names.ts';
import { HOST_PACK_ID } from '../ids/refs.ts';
import { FEATURE_ID_PATTERN, PACK_ID_PATTERN } from '../ids/refs.ts';
import { _compileSettingsDefinition, _SettingsDefaultsError } from '../framework/settings-validation.ts';
import type { SettingsDefinition } from '../framework/settings-definition.ts';
import type { PackMigrations } from '../framework/pack-registration.ts';
import type { ReferenceDeclarations } from '../framework/reference-declaration.ts';
import type { PluginDeclaration } from '../framework/plugin-declaration.ts';

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

/** Check names before Zod decodes records: its object merge discards an own __proto__ key. */
function checkDeclaredNames(raw: unknown, ctx: z.RefinementCtx): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const declaration = raw as Record<string, unknown>;
  try {
    for (const { name, owner } of _packEntities(declaration)) {
      const path = [...owner.split('.'), 'entities'];
      notSdkOwned(SDK_ENTITIES)({ [name]: name }, {
        path: [...ctx.path, ...path],
        addIssue: issue => ctx.addIssue({ ...issue, path: [...path, ...(issue.path ?? [])] }),
      });
    }
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : String(error) });
  }
  return raw;
}

// ── Sub-schemas ─────────────────────────────────────────────────────

/** A named export of a pack source file */
const ExportTargetSchema = z.string().regex(_MODULE_REFERENCE_PATTERN, 'Must be "path#exportName"');

const EntitiesSchema = z.record(z.string().min(1), ExportTargetSchema.nullable())
  .describe('Entity wire names mapped to pack-root-relative TypeScript shape exports (path#exportName), or null for untyped entities.');
const RelationsSchema = z.array(z.string().regex(_RELATION_WIRE_PATTERN, 'Must be a snake_case relation wire name'))
  .superRefine((relations, ctx) => {
    try { notSdkOwned(SDK_REL_KINDS)(_packRelationTypes({ data: { relations } }), ctx); }
    catch (error) { ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : String(error) }); }
  }).describe('Pack-level relation wire names; generated EARS constants are their uppercase names. Do not repeat or redeclare SDK-owned wires.');
const DataSchema = z.object({ entities: EntitiesSchema.optional(), relations: RelationsSchema.optional() }).strict()
  .describe('Pack-level data declarations without a feature owner.');

const SettingsDefinitionShape = {
  schema: z.record(z.unknown()).describe('JSON Schema draft-07 for the effective settings object; references stay within this schema.'),
  defaults: z.record(z.unknown()).describe('Complete explicit baseline values, validated without coercion or schema default population.'),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  form: z.string().min(1).describe('Source path of the custom settings form; its default export is a component.').optional(),
  access: z.enum(['shared', 'owner']).describe('Shared with declared dependents by default; owner restricts writes and resets.').optional(),
} satisfies Record<keyof SettingsDefinition, z.ZodTypeAny>;

const SettingsDefinitionValueSchema = z.object(SettingsDefinitionShape).strict();
const SettingsDefinitionSchema = z.preprocess((raw, ctx) => {
  // Validate original JSON: record decoding can discard an own __proto__ default before semantic checks.
  if (SettingsDefinitionValueSchema.safeParse(raw).success) {
    try { _compileSettingsDefinition(raw as SettingsDefinition); }
    catch (error) {
      if (error instanceof _SettingsDefaultsError) {
        for (const problem of error.problems) ctx.addIssue({ code: 'custom', path: ['defaults', ...problem.path], message: problem.message });
      } else ctx.addIssue({ code: 'custom', path: ['schema'], message: error instanceof Error ? error.message : String(error) });
    }
  }
  return raw;
}, SettingsDefinitionValueSchema);

/** @internal Host composition admits the same settings data without external-pack entry paths. */
export const _NativePackDeclarationSchema = z.preprocess(checkDeclaredNames, z.object({
  id: z.string().regex(PACK_ID_PATTERN),
  dependencies: z.record(z.string().regex(PACK_ID_PATTERN), z.string()).optional(),
  settings: z.record(z.string().regex(FEATURE_ID_PATTERN), SettingsDefinitionSchema).optional(),
  data: DataSchema.optional(),
  lifecycle: z.lazy(() => LifecycleConfigSchema).optional(),
  features: z.record(z.string().regex(FEATURE_ID_PATTERN), z.object({
    entities: EntitiesSchema.optional(),
    settings: SettingsDefinitionSchema.optional(),
    plugin: z.lazy(() => PluginSchema).optional(),
    references: z.lazy(() => ReferencesSchema).optional(),
  }).strict()).optional(),
}).strict().superRefine((declaration, ctx) => checkReferenceClaims(declaration.features, ctx)));

export const StepDSLMetaSchema = z.object({
  primaryField: z.string().describe('The field whose value becomes the step label in the flow editor.').optional(),
  defaultLabel: z.string().describe('Fallback label when primaryField is empty.').optional(),
  custom: z.literal(true).describe('Marks the step as a custom (non-built-in) type.').optional(),
}).strict();

/**
 * What a step's runtime facet is: the flags the brain reads before it runs anything, and the handler it
 * runs, named as a `"path#exportName"` so the module holding it is loaded on the step's first run rather
 * than at pack load. A step whose whole behaviour is a flag (`subflow`) declares no handler; one with no
 * handler at all is completed for it, so a step that means to wait declares the handler that waits.
 */
const StepRuntimeSchema = z.object({
  handler: ExportTargetSchema.describe('"path#exportName" of the function that runs the step. Loaded on its first run, unless `sync`.').optional(),
  sync: z.literal(true).describe("The handler's sends have to land in the brain's own dispatch, so its module is imported with the pack entry rather than on the step's first run. For a handler that both ends the flow and completes itself, where the two sends must be ordered with the transition that called it.").optional(),
  isAsync: z.literal(true).describe('The handler returns a promise, so the brain reports a rejection as the step\'s error.').optional(),
  waits: z.literal(true).describe('The step holds the flow at this node instead of completing.').optional(),
  spawnsSubflow: z.literal(true).describe('The step runs another flow, which the brain spawns in place of a step node.').optional(),
}).strict().superRefine((runtime, ctx) => {
  if (runtime.sync && runtime.isAsync) {
    ctx.addIssue({ code: 'custom', message: '`sync` and `isAsync` are opposites: a handler whose sends must land in the brain\'s dispatch cannot be awaited' });
  }
  if (runtime.sync && !runtime.handler) {
    ctx.addIssue({ code: 'custom', message: '`sync` describes how a handler is loaded, so it needs one' });
  }
});

/** A trigger's facet: its eager half by reference, and the `register` it only needs while running */
const StepTriggerSchema = z.object({
  facet: ExportTargetSchema.describe('"path#exportName" of the TriggerFacet: how a track compiles, decompiles and validates.'),
  register: ExportTargetSchema.describe('"path#exportName" of the function that starts the trigger. Loaded when it is first registered.').optional(),
}).strict();

/**
 * One step type: its facets, each named where its code is. A step's `build` facet is what a dependent
 * pack's `apack pack build` validates flows with, its `fe` facet is what the flow editor draws, and its
 * `runtime` is what the brain runs — so the three go to three different places and none of them is a
 * barrel the author keeps in step with the others.
 *
 * `node` is the exception and the one facet that is **required**: it says what a node of the type is
 * rather than what any one process does with it, so both registrations carry it and every step has one.
 * It is required because it was not: the label and the field defaults lived in `fe`, which the backend
 * cannot import, so every node the app created was missing them and nothing said so.
 */
export const StepEntrySchema = z.object({
  kind: z.enum(['step', 'trigger']).describe('Whether this is a regular step or a trigger. "step" is the default.').optional(),
  node: ExportTargetSchema.describe('"path#exportName" of its StepNodeFacet: the label a new node starts with and the fields it starts with. Declare it in a module no Vue or icon import reaches — its `build` module is the usual home — because the backend reads it too.'),
  build: ExportTargetSchema.describe('"path#exportName" of its StepBuildFacet (compile, validate, getLabel, decompile). A trigger declares `trigger` instead.').optional(),
  trigger: StepTriggerSchema.describe('For a trigger: its TriggerFacet and the function that starts it.').optional(),
  fe: ExportTargetSchema.describe('"path#exportName" of its StepFEFacet: what the flow editor draws and the form it opens.').optional(),
  runtime: StepRuntimeSchema.describe('What the brain runs, and the flags it reads before running it.').optional(),
  dsl: StepDSLMetaSchema.describe('DSL configuration for flow-helper generation.').optional(),
}).strict().superRefine((entry, ctx) => {
  if (entry.kind === 'trigger' && entry.build) {
    ctx.addIssue({ code: 'custom', message: 'A trigger declares `trigger`, not `build`' });
  }
  if (entry.kind !== 'trigger' && entry.trigger) {
    ctx.addIssue({ code: 'custom', message: 'Only a step with `"kind": "trigger"` declares `trigger`' });
  }
});

export const DslEntrySchema = z.object({
  entry: z.string().describe('Path to the DSL type definition module.'),
  targets: z.array(z.enum(['monaco'])).describe('Editor targets for intellisense integration.'),
  prefix: z.string().describe('Namespace prefix for DSL symbols.').optional(),
  globals: z.record(z.string(), z.string()).describe('Global type mappings injected into the DSL scope.').optional(),
  inline: z.array(z.string()).describe('Packages whose declarations are bundled into the editor definitions, besides @apackdev/* and the pack\'s own modules. The editor loads no node_modules, so a type it needs from another package belongs here.').optional(),
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
    .describe('The entity types the format\'s items are written as. Omitted, sources using it are compiled and never written (content.datasets).').optional(),
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
 * A compiled dataset the pack reads back itself, never written to the database: the build produces
 * `<key>.content.json` and the pack's own code reads it.
 *
 * It is a key of its own because the alternative was a `content.sources` entry whose format declared no
 * entity: compiled, indexed, given an applier that could only find nothing to do, and a standing
 * contradiction with "every source a pack declares is applied". The format it names must declare no
 * `entity`, which is the whole of what makes it a dataset rather than content.
 *
 * It is not an `extensions.artifacts` entry, which is a viewer type the app registers. Nothing of a
 * dataset is registered or reachable from another pack: the declaring pack compiles it and reads it.
 */
const ContentDatasetsSchema = z.record(CONTENT_KEY_SCHEMA, ContentSourceSchema).superRefine((datasets, ctx) => {
  for (const [key, entry] of Object.entries(datasets)) {
    if (!entry.path || !entry.format || entry.applier) {
      ctx.addIssue({ code: 'custom', path: [key], message: `Dataset "${key}" must be { "path", "format" }: it is compiled and never written, so it takes no applier` });
    }
    // Nothing of a dataset reaches the database, so there is no edit of the user's for a policy to be about
    if (entry.onUserEdit) {
      ctx.addIssue({ code: 'custom', path: [key], message: `Dataset "${key}" is never written, so "onUserEdit" decides nothing: drop it` });
    }
  }
});


const SystemSchema = z.object({
  entry: z.string().describe('Path to the backend system module.'),
  contract: z.string().describe('"path#exportName" of this system\'s contract: a declared type holding its context and its incoming, internal and outgoing events (SystemContract, @apackdev/sdk/framework). It lives in a leaf module of its own (be/contract.ts), so codegen reads it without running anything. Omit it for a system that sends no events.').optional(),
  events: z.object({
    incoming: z.array(z.string()).describe('Event types this system listens for.').optional(),
  }).strict().describe('Event routing declarations.').optional(),
}).strict();

const ModuleTargetSchema = z.string().regex(/^[^#]+(?:#[A-Za-z_$][\w$]*)?$/, 'Must be a module path or path#exportName');
const ComponentModuleSchema = z.object({
  entry: ModuleTargetSchema,
  load: z.literal('lazy').optional(),
}).strict();
const ComponentTargetSchema = z.union([ModuleTargetSchema, ComponentModuleSchema]);

/** The same feature ownership checks apply to authored and native declarations. */
function checkReferenceClaims(features: Record<string, { references?: ReferenceDeclarations }> | undefined, ctx: z.RefinementCtx): void {
  const referenceClaims = { types: new Map<string, string>(), categories: new Map<string, string>() };
  const claim = (kind: keyof typeof referenceClaims, name: string, feature: string, path: string[]) => {
    const previous = referenceClaims[kind].get(name);
    if (previous !== undefined) ctx.addIssue({ code: 'custom', path,
      message: `Reference ${kind} "${name}" claimed by both features "${previous}" and "${feature}"` });
    else referenceClaims[kind].set(name, feature);
  };
  for (const [feature, entry] of Object.entries(features ?? {})) {
    for (const name of Object.keys(entry.references?.types ?? {})) {
      const path = ['features', feature, 'references', 'types', name];
      claim('types', name, feature, path);
    }
    for (const name of Object.keys(entry.references?.categories ?? {})) {
      claim('categories', name, feature, ['features', feature, 'references', 'categories', name]);
    }
  }
}

const ReferenceNameSchema = z.string().regex(/^[a-z][a-z0-9_-]*$/, 'Must be a lowercase reference name');
const ReferenceIconSchema = z.union([z.string().regex(/^[A-Z][A-Za-z0-9]*$/, 'Must name a lucide-vue-next export'), ComponentModuleSchema]);
const ReferencesSchema: z.ZodType<ReferenceDeclarations> = z.object({
  types: z.record(ReferenceNameSchema, z.object({
    category: ReferenceNameSchema,
    icon: ReferenceIconSchema,
    svgElements: z.array(z.union([
      z.tuple([z.literal('path'), z.object({ d: z.string() }).strict()]),
      z.tuple([z.literal('rect'), z.record(z.string())]),
      z.tuple([z.literal('circle'), z.record(z.string())]),
    ])),
    navigate: ExportTargetSchema,
  }).strict()),
  categories: z.record(ReferenceNameSchema, z.object({
    label: z.string().min(1).refine(value => value.trim().length > 0, 'Must have a visible label'),
    icon: ReferenceIconSchema,
    useItems: ExportTargetSchema,
  }).strict()),
}).strict();

const PluginSchema: z.ZodType<PluginDeclaration> = z.object({
  label: z.string().min(1).refine(value => value.trim().length > 0, 'Must have a visible label'),
  state: ModuleTargetSchema.describe('Machine module, by default export or path#exportName.'),
  icon: z.union([z.string().regex(/^[A-Z][A-Za-z0-9]*$/, 'Must name a lucide-vue-next export'), ComponentModuleSchema]).optional(),
  canvas: z.union([ComponentTargetSchema, z.object({ routes: z.record(z.string().min(1)
    .refine(route => !['__proto__', 'constructor', 'prototype'].includes(route), 'Reserved route name'), ComponentTargetSchema)
    .refine(routes => Object.keys(routes).length > 0, 'Must declare at least one route') }).strict()]).optional(),
  panel: ComponentTargetSchema.optional(),
  chat: ComponentTargetSchema.optional(),
  isPinned: z.boolean().optional(),
  hotkeys: z.array(z.object({ action: z.string().min(1), global: z.boolean().optional() }).strict()).optional(),
  options: z.object({ headerClass: z.string().optional() }).strict().optional(),
  fallbackPanel: z.object({ label: z.string().min(1), toggle: z.object({ type: z.string().min(1) }).strict(),
    isShown: ExportTargetSchema }).strict().optional(),
  defaultVisible: z.boolean().describe('Default navigation visibility, independent of settings values and the startup default claim.').optional(),
  contract: z.string().describe('"path#exportName" of this plugin\'s contract: a declared type holding the state it publishes and the inbox other plugins may send to (PluginInbox, @apackdev/sdk/fe). It lives in a leaf module of its own (fe/contract.ts), which the plugin\'s machine does not import, so codegen can read it without resolving the machine. Omit it for a plugin that publishes nothing: it still receives its own feature\'s system events.').optional(),
  default: z.boolean().describe('Show this plugin when the app starts. At most one of a pack\'s features may claim it; the first pack to register one across the app wins.').optional(),
} satisfies Record<keyof PluginDeclaration, z.ZodTypeAny>).strict();


/** Names a feature id can't take: reserved words, since a feature id becomes an identifier in generated code */
const RESERVED_FEATURE_IDS = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
  'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements', 'import', 'in',
  'instanceof', 'interface', 'let', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'static',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  'arguments', 'eval',
]);

const IdentifierSchema = z.string().regex(/^[A-Za-z_$][\w$]*$/, 'Must be an identifier');

/**
 * The key of an extension point entry: the *type* a pack contributes, which is data rather than a name in
 * generated code — so unlike a feature id it may hold `_` and `-` (`keep_alive`, `project-select` both
 * exist). An extension point is a map keyed by this, which is what makes a duplicate type unrepresentable:
 * JSON cannot hold one key twice, so nothing has to check for it and nothing can forget to.
 */
const EXTENSION_TYPE_SCHEMA = z.string()
  .regex(/^[a-z][a-z0-9_-]*$/, 'Must be a lowercase letter, then lowercase letters, digits, underscores and hyphens');

/**
 * One message block: what it is, and where the code that draws it lives. `fe` is a path because a `.vue`
 * file's component is its default export, the way `fe.appExtensions` names one.
 */
export const BlockEntrySchema = z.object({
  kind: z.enum(['display', 'input']).describe('Whether the chat renders it as content or as something the user acts on. Display is the default.').optional(),
  fe: z.string().describe('Path to the component that draws it (a .vue file, taken by its default export).').optional(),
  be: ExportTargetSchema.describe('"path#exportName" of its backend facet (BlockBEFacet), for a block that summarises itself in a transcript.').optional(),
}).strict();

/**
 * One artifact type: the icon the chat lists it under, and the viewer that opens it. `icon` is the name of
 * a `lucide-vue-next` export, which is the icon set the host provides every pack's frontend
 * (`SHARED_DEPS`), so a pack names one rather than shipping a component; a name lucide does not export
 * fails the pack's own typecheck on the generated frontend entry.
 */
export const ArtifactEntrySchema = z.object({
  icon: z.string().regex(/^[A-Z][A-Za-z0-9]*$/, 'Must be the name of a lucide-vue-next export, e.g. "ListTodo"')
    .describe('Name of the lucide-vue-next icon shown in the artifact list.'),
  fe: z.string().describe('Path to the viewer that opens it (a .vue file, taken by its default export). Without one the host shows the text viewer.').optional(),
}).strict();

export const ContentConfigSchema = z.object({
  sources: ContentSourcesSchema
    .describe('Content this pack writes into the database. Keys name the content; the specialty keys (actions, prompts, flows) take a path, other keys an entry object.').optional(),
  datasets: ContentDatasetsSchema
    .describe('Compiled datasets the pack reads back itself, never written to the database. Each names a format declaring no entity.').optional(),
  formats: z.record(CONTENT_KEY_SCHEMA, ContentFormatSchema)
    .describe('Named formats that turn a source into items. A content source names one; a dependent pack names one of these as "<this pack id>:<name>".').optional(),
  writers: z.record(z.string(), ExportTargetSchema)
    .describe('How one entity type this pack declares is found, created, updated and removed when content is written as it ("path#exportName" of a ContentWriter object). Any pack writing that entity type goes through them.').optional(),
}).strict().describe("A pack's content: what it ships, how it is compiled, and how it reaches the database.");

export const LifecycleConfigSchema = z.object({
  onInit: ExportTargetSchema.describe('Function called after hydration, before migrations and content.').optional(),
  onShutdown: ExportTargetSchema.describe('Function called when this pack stops.').optional(),
} satisfies Record<keyof PackLifecycleDeclaration, z.ZodTypeAny>).strict().describe('Explicit lifecycle function targets, discoverable without loading their modules.');


const ServicesSchema = z.record(IdentifierSchema, ExportTargetSchema);

/**
 * A command's name, which is its key: what the user types after the `/`. Stricter than a contributed
 * type's, which admits an underscore — a command is typed, so it keeps to letters, digits and hyphens.
 */
const COMMAND_NAME_SCHEMA = z.string()
  .regex(/^[a-z][a-z0-9-]*$/, 'Must be a lowercase letter, then lowercase letters, digits and hyphens');

/** A slash command a pack declares: the chat lists it, and a `user.command` event carries its name */
export const CommandEntrySchema = z.object({
  placeholder: z.string().min(1).describe('What the chat shows after the command: the argument it takes, or what it does.'),
}).strict();

/**
 * A feature id: the key its entry sits under. It becomes a name in generated code, so unlike a step or
 * block *type* it is an identifier — no hyphens, no underscores — and not a word generated code already
 * uses. Being a key is what makes a duplicate unrepresentable: two features with one id used to collapse
 * last-wins across five generated modules, silently.
 */
const FEATURE_ID_SCHEMA = z.string()
  .regex(FEATURE_ID_PATTERN, 'Must start with a lowercase letter and contain only letters and digits (e.g. "notes", "calendarEvents")')
  .refine((id) => !RESERVED_FEATURE_IDS.has(id), (id) => ({ message: `"${id}" is reserved in generated code: pick another feature id` }));

export const FeatureEntrySchema = z.object({
  entities: EntitiesSchema.describe('Entities owned by this feature; placement does not change their wire names.').optional(),
  designation: z.string().describe('Links the system to an EARS designation.').optional(),
  settings: SettingsDefinitionSchema.describe('Declarative feature preferences: effective-value schema and explicit defaults.').optional(),
  types: z.string().min(1).regex(/^[^#]+$/, 'Must name a TypeScript module, not a single export').describe('Pack-root-relative TypeScript module whose public types are re-exported through #generated/types. Only declared modules contribute; no feature-path inference.').optional(),
  system: SystemSchema.describe('Backend system module.').optional(),
  plugin: PluginSchema.describe('Frontend plugin definition.').optional(),
  services: ServicesSchema
    .describe('Services. Keys are service names on `services`, values are "path#exportName" of the service object (an object literal or a class instance, not a factory) in a source file.').optional(),
  repositories: z.record(IdentifierSchema, ExportTargetSchema)
    .describe('Repository objects. Keys are repository names on `repository` (from #generated/repository), values are "path#exportName" of the object in a source file.').optional(),
  references: ReferencesSchema.describe('Reference identities and presentation, with explicit navigation and reactive item-provider exports.').optional(),
}).strict();

export const PackPermissionSchema = z.enum(['ears', 'llm', 'filesystem', 'network', 'terminal']);

/**
 * How the pack is built. These are settings no part of the app reads — unlike `entities` or `features`,
 * which the host loads at boot — so what belongs here is anything that changes only what `apack pack build`
 * produces or how long it takes.
 */
const BuildConfigSchema = z.object({
  opaqueDeps: z.array(z.string()).describe('Dependencies the frontend bundle includes whole instead of tree-shaking, by package name. For a prebuilt bundle — a dependency shipped as one already-minified file, or compiled from another language — where the shake removes almost nothing and walking it is most of the build. Each ships as it is, so nothing inside it is dead-code eliminated.').optional(),
  bundleUi: z.boolean().describe('Bundle a copy of @apackdev/ui into the pack instead of using the host app\'s. All of @apackdev/ui is bundled, so the pack never mixes the two.').optional(),
}).strict().describe('Build-time configuration: settings that change what the build produces, never what the app loads.');

const FEConfigSchema = z.object({
  tiptapPlugins: z.string().describe('Path to tiptap plugin registration module.').optional(),
  appExtensions: z.record(IdentifierSchema, z.string()).describe('Named app extensions. Keys are extension names (identifiers), values are paths to Vue components.').optional(),
}).strict().describe('Frontend contributions: what the pack adds to the app\'s own UI.');

/**
 * An extension point keyed by the type it contributes: the key grammar and the clause every one of them
 * repeats, said once. Three records spelling it out is three places it can drift from
 * `EXTENSION_TYPE_SCHEMA` — and the rule is the same rule, since what makes a contribution unique is that
 * JSON cannot hold a key twice.
 *
 * `dsl` is deliberately not one of these: its keys are DSL namespace names rather than contributed types,
 * so they answer to no type grammar.
 */
function extensionPoint<T extends z.ZodTypeAny>(
  entry: T,
  what: string,
  key: z.ZodString = EXTENSION_TYPE_SCHEMA,
): z.ZodOptional<z.ZodRecord<z.ZodString, T>> {
  return z.record(key, entry)
    .describe(`${what} The type is the key, so a pack cannot declare one twice.`)
    .optional();
}

/**
 * What the pack gives the host, as against what it is made of (`features`) or what data it ships
 * (`content`). Every entry is a contribution the app registers and some other pack or the shell can
 * reach; a setting that only changes what `apack pack build` produces is `build`, not one of these.
 */
const ExtensionsSchema = z.object({
  settings: z.record(z.string().regex(FEATURE_ID_PATTERN, 'A settings group must start with a lowercase letter and contain only letters and digits'), SettingsDefinitionSchema)
    .describe('Pack-owned preference groups keyed by local group ID; stored under this pack, independently of app and feature settings.').optional(),
  help: z.object({ path: z.string().min(1) }).strict()
    .describe('Directory of Markdown help articles, bundled into the pack runtime.').optional(),
  steps: extensionPoint(StepEntrySchema, 'Flow step types this pack contributes. Each names where its node, build, frontend and runtime facets live.'),
  artifacts: extensionPoint(ArtifactEntrySchema, 'Artifact types this pack contributes. Each names its icon and viewer.'),
  blocks: extensionPoint(BlockEntrySchema, 'Message blocks this pack contributes. Each names where its code lives.'),
  commands: extensionPoint(
    CommandEntrySchema,
    'Slash commands this pack adds to the chat, keyed by the name typed after the "/". Sending one fires a `user.command` event the pack\'s flows handle.',
    COMMAND_NAME_SCHEMA,
  ),
  services: ServicesSchema
    .describe('Pack-level services, belonging to no one feature. Keys are service names on `services`, values are "path#exportName" of the service object (an object literal or a class instance, not a factory) in a source file. A feature\'s own are its `services`.').optional(),
  dsl: z.record(z.string(), DslEntrySchema).describe('DSL type definitions for Monaco editor intellisense.').optional(),
  fe: FEConfigSchema.optional(),
}).strict().describe('What the pack contributes to the app: steps, artifacts, blocks, commands, services, DSL types, help articles and frontend extensions.');


// ── Main manifest schema ────────────────────────────────────────────

/**
 * A migration's key: the version it targets, which is the only place that version is written. Exported
 * because `apack pack add migration` checks a version against it before writing one — the schema is what
 * refuses a bad key, and it cannot do so until the manifest has already been written.
 */
export const MIGRATION_TARGET_PATTERN = /^\d+\.\d+\.\d+$/;

const MIGRATION_TARGET_SCHEMA = z.string()
  .regex(MIGRATION_TARGET_PATTERN, 'Must be the version the migration targets, as "major.minor.patch"');

/**
 * Migrations, keyed by the version each targets, under the **version line** that version belongs to.
 *
 * **Two maps rather than one, because a bare version does not say what it is a version of.** `0.4.0` is
 * either apack's release or the pack's own, and letting the *runner* decide — from the pack's
 * provenance, which is the one thing about a pack that correlates with neither — makes the same key mean
 * both. `default-setup` is the pack that shows why: its own `version` is `0.1.0` while its migrations are
 * keyed `0.3.0`-`0.4.0`, because they are apack's releases, and a user's own build installed at that
 * id would have its versions compared against the app's.
 *
 * - `app` — the data moves when apack moves. A prerelease counts as its release, and a development
 *   build runs every pending one on each boot (`@apackdev/host`'s runners).
 * - `pack` — the data moves when this pack moves, against `version` in this manifest.
 *
 * **A map rather than a field on each entry**, because a field needs a default and whichever default it took
 * would be the next thing silently deciding for an author. The key stays the target, so one line cannot
 * declare the same version twice — JSON cannot hold a key twice.
 */
export const MigrationDeclarationSchema = z.object({
  description: z.string().min(1).describe('What this versioned data change does.'),
  up: ExportTargetSchema.describe('Synchronous function applying the change.'),
}).strict();

export const MigrationsSchema = z.object({
  app: z.record(MIGRATION_TARGET_SCHEMA, MigrationDeclarationSchema)
    .describe('Migrations on apack\'s version line, keyed by the release each targets. For data whose shape follows the app rather than this pack.').optional(),
  pack: z.record(MIGRATION_TARGET_SCHEMA, MigrationDeclarationSchema)
    .describe('Migrations on this pack\'s own version line, keyed by the version each targets, compared against `version` in this manifest.').optional(),
}).strict().describe('Migrations this pack runs, under the version line each targets. The key is the version; the declaration owns its description and names the executable up function.');

/**
 * The version lines, derived from the schema so the list and the keys cannot disagree. Codegen emits a map
 * per line and the runners read one each.
 */
export const MIGRATION_LINES = Object.keys(MigrationsSchema.shape) as MigrationLine[];

/** Which version line a migration's target is a version of */
export type MigrationLine = keyof typeof MigrationsSchema.shape;

/**
 * The lines are one vocabulary written twice — here with the schema's descriptions, and in
 * `PackMigrations` with the doc comments a pack author hovers — because a Zod shape cannot carry the second
 * and a type cannot be built at runtime. This fails the typecheck the moment they part, which is the thing
 * writing it twice costs.
 *
 * @internal
 */
type _Asserted<T extends true> = T;
export type _MigrationLinesMatchRegistration = _Asserted<
  MigrationLine extends keyof PackMigrations
    ? keyof PackMigrations extends MigrationLine ? true : ['the registration declares a line the manifest does not', Exclude<keyof PackMigrations, MigrationLine>]
    : ['the manifest declares a line the registration does not', Exclude<MigrationLine, keyof PackMigrations>]
>;

export const ManifestSchema = z.preprocess(checkDeclaredNames, z.object({
  $schema: z.string().describe('JSON Schema reference for editor validation.').optional(),
  $manifestVersion: z.literal(1).optional()
    .describe('Schema version. Enables future format evolution.'),
  id: z.string().regex(PACK_ID_PATTERN, 'Must be lowercase alphanumeric with hyphens')
    .refine((id) => id !== HOST_PACK_ID, { message: `"${HOST_PACK_ID}" is the app's own pack id: pick another` })
    .describe('Unique pack identifier. Lowercase, alphanumeric with hyphens.'),
  name: z.string().min(1).describe('Human-readable pack name.'),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'Must be a semver version string')
    .describe('Semver version string.'),
  description: z.string().describe('Short description of the pack\'s purpose.').optional(),
  hostVersion: z.string().describe('Semver range for compatible host versions (e.g. ">=0.3.0").').optional(),
  license: z.string().describe('SPDX license identifier.').optional(),
  dependencies: z.record(z.string(), z.string())
    .describe('Other packs this pack depends on. Keys are pack IDs, values are semver ranges or file/URL references.').optional(),
  permissions: z.array(PackPermissionSchema).describe('Capabilities this pack requires from the host.').optional(),
  data: DataSchema.optional(),
  features: z.record(FEATURE_ID_SCHEMA, FeatureEntrySchema)
    .describe('Feature definitions, keyed by feature id. Each feature bundles a backend system, frontend plugin, services, and settings; the id is the key, so a pack cannot declare one twice.').optional(),
  extensions: ExtensionsSchema.optional(),
  lifecycle: LifecycleConfigSchema.optional(),
  content: ContentConfigSchema.optional(),
  migrations: MigrationsSchema.optional(),
  build: BuildConfigSchema.optional(),
}).strict().superRefine((manifest, ctx) => {
  checkReferenceClaims(manifest.features, ctx);
  // Which plugin opens first is one plugin's annotation, so a pack naming two has said nothing
  const claimedDefault = Object.entries(manifest.features ?? {}).filter(([, feature]) => feature.plugin?.default);
  if (claimedDefault.length > 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['features', claimedDefault[1]![0], 'plugin', 'default'],
      message: `Two features claim the default plugin: "${claimedDefault[0]![0]}" and "${claimedDefault[1]![0]}". Only one may.`,
    });
  }

  // Both kinds of entry name a format, and both are checked against the same two places
  for (const section of ['sources', 'datasets'] as const) {
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
  for (const key of Object.keys(manifest.content?.datasets ?? {})) {
    if (key in (manifest.content?.sources ?? {})) {
      ctx.addIssue({ code: 'custom', path: ['content', 'datasets', key], message: `"${key}" is both a content source and a dataset: they compile to the same file` });
    }
  }
  let declared: Set<string>;
  try { declared = new Set(Object.keys(_packEntityTypes(manifest))); }
  catch { return; } // Duplicate homes were diagnosed against the original input above.
  for (const entity of Object.keys(manifest.content?.writers ?? {})) {
    if (!declared.has(entity)) {
      ctx.addIssue({ code: 'custom', path: ['content', 'writers', entity], message: `A content writer for "${entity}": only entity types this pack declares under a feature or data.entities can have one` });
    }
  }
}));
