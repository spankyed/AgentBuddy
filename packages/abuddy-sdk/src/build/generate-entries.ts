import { readFileSync, existsSync, statSync } from 'fs';
import { HOST_PLUGIN_EVENT_TYPES, HOST_SYSTEM_EVENT_TYPES } from '../events/index.ts';
import { extname, join } from 'path';
import { _mergeProvenance, type PackManifest, type PackFeatureEntry, type PackProvenance, type PackTypeManifest, type PackSnapshot, type ProvenanceKind, type StepEntry } from './manifest.ts';
import { SDK_ENTITIES, SDK_REL_KINDS, SDK_SHAPED_ENTITIES } from '../types/sdk-entities.ts';
import { _reservedEntries } from '../types/reserved-names.ts';
import { formatEntities } from './seeds/records.ts';
import { resolveSeeds, type ResolvedSeed } from './seeds/resolve.ts';
import { createModuleExports, type ExportInfo, type ModuleExports } from './module-exports.ts';
import { hasOwn } from '../utils/shared.ts';

const HEADER = `// @generated from abuddy.json — do not edit by hand
// Regenerate: abuddy generate-entries\n`;

// ── EARS emitter ─────────────────────────────────────────────────

interface RegistryEntry { value: string; source: string }

/** The registry source of the entities the SDK owns */
const SDK_SOURCE = '@abuddy/sdk';

export function mergeRegistries(
  ownId: string,
  manifest: PackManifest,
  depManifests: Map<string, PackTypeManifest>,
  /**
   * Per dependency, which pack declares each name it surfaces — its snapshot's `provenance`.
   *
   * Per dependency, not merged across them: that distinction is the whole check. Two dependencies
   * naming the same ancestor for a name is a diamond and fine; two naming different packs is a real
   * collision. A single merged record answers "who declares this" and cannot tell those apart.
   */
  depProvenance: Map<string, PackProvenance> = new Map(),
) {
  function merge(own: Record<string, string> = {}, kind: string) {
    // The SDK's own entities and relation kinds are in every pack, and no pack declares them
    const sdkOwned: Record<string, string> = kind === 'entity' ? SDK_ENTITIES : SDK_REL_KINDS;
    const errors = _reservedEntries(own, sdkOwned).map((entry) => `${kind} ${entry} is defined by the SDK; remove it from abuddy.json`);
    for (const [depId, dep] of depManifests) {
      const depEntries = kind === 'entity' ? dep.entities : dep.relKinds;
      for (const entry of _reservedEntries(depEntries, sdkOwned)) {
        errors.push(`${kind} ${entry} from "${depId}" is defined by the SDK: rebuild "${depId}" with the current abuddy CLI`);
      }
    }
    if (errors.length > 0) throw new Error(`Type conflicts:\n  ${errors.join('\n  ')}`);

    const map = new Map<string, RegistryEntry>();
    // Each name and each value has one source
    const valueSources = new Map<string, string>();
    const sources: Array<[string, Record<string, string>]> = [[ownId, own]];
    for (const [depId, dep] of depManifests) sources.push([depId, kind === 'entity' ? dep.entities : dep.relKinds]);
    /**
     * Who declares a name, rather than which dependency handed it over. A dependency surfaces its own
     * dependencies' names too, so the same ancestor name arrives through every path that reaches it;
     * attributing it to the dependency it came through makes a diamond look like a collision.
     */
    const provenanceKind: ProvenanceKind = kind === 'entity' ? 'entities' : 'relKinds';
    /**
     * `hasOwnProperty` rather than indexing, because these records come off a snapshot read from disk
     * and are indexed by names a manifest chose. `entities`/`relKinds` are unrestricted strings, so a
     * name like `constructor` is legal — and indexing an ordinary object for it finds `Object`'s
     * constructor and returns that function as the declaring pack, instead of falling back to the
     * dependency the name arrived through. (`Object.hasOwn` is newer than the shared lib floor.)
     */
    const declaringPack = (via: string, key: string): string => {
      if (via === ownId) return ownId;
      const declared = depProvenance.get(via)?.[provenanceKind];
      return declared && hasOwn(declared, key) ? declared[key] : via;
    };
    for (const [via, entries] of sources) {
      for (const [key, value] of Object.entries(entries)) {
        const source = declaringPack(via, key);
        const existing = map.get(key)?.source ?? valueSources.get(value);
        if (existing !== undefined && existing !== source) {
          errors.push(`${kind} "${key}" declared by both "${existing}" and "${source}"`);
          continue;
        }
        map.set(key, { value, source });
        valueSources.set(value, source);
      }
    }
    if (errors.length > 0) throw new Error(`Type conflicts:\n  ${errors.join('\n  ')}`);

    for (const [key, value] of Object.entries(sdkOwned)) map.set(key, { value, source: SDK_SOURCE });
    return map;
  }

  return {
    entities: merge(manifest.entities, 'entity'),
    relKinds: merge(manifest.relKinds, 'relKind'),
  };
}

function emitNamespaceMembers(
  ownId: string,
  registry: Map<string, RegistryEntry>,
): string[] {
  const lines: string[] = [];
  const groups = new Map<string, string[]>();
  for (const [key, { source }] of registry) {
    const g = groups.get(source) ?? [];
    g.push(key);
    groups.set(source, g);
  }

  const ownKeys = groups.get(ownId);
  if (ownKeys) {
    for (const key of ownKeys) {
      lines.push(`    export const ${key} = '${registry.get(key)!.value}';`);
      lines.push(`    export type ${key} = typeof ${key};`);
    }
    groups.delete(ownId);
  }

  for (const [depId, keys] of groups) {
    lines.push(`    // ${depId}`);
    for (const key of keys) {
      lines.push(`    export const ${key} = '${registry.get(key)!.value}';`);
      lines.push(`    export type ${key} = typeof ${key};`);
    }
  }

  return lines;
}

export function emitEARS(ownId: string, registry: ReturnType<typeof mergeRegistries>): string {
  const entityMembers = emitNamespaceMembers(ownId, registry.entities);
  const relKindMembers = emitNamespaceMembers(ownId, registry.relKinds);

  // A pack with no entities of its own or its dependencies' keeps an open Entity type; the SDK's
  // Relation alone doesn't close it
  const declaresEntities = [...registry.entities.values()].some(({ source }) => source !== SDK_SOURCE);
  const entityUnion = declaresEntities ? [...registry.entities.keys()].map(k => `Entity.${k}`).join(' | ') : 'string';
  const relUnion = [...registry.relKinds.keys()].map(k => `RelKind.${k}`).join(' | ');
  const relType = relUnion ? `${relUnion} | (string & {})` : '(string & {})';

  // A namespace without members has no runtime value, and EARS.Entity is read at runtime
  const entityValue = entityMembers.length > 0
    ? `  export namespace Entity {\n${entityMembers.join('\n')}\n  }`
    : '  export const Entity = {};';

  return `// Auto-generated by \`abuddy generate-entries\` — do not edit.

export namespace EARS {
${entityValue}
  export type Entity = ${entityUnion};

  export type EntityId<E extends string = string> = import('@abuddy/ears').EARS.EntityId<E>;

  export namespace RelKind {
${relKindMembers.join('\n')}
    export const Custom = <T extends string>(k: T) => k as T & RelKind;
  }
  export type RelKind = ${relType};

  export namespace RoleKind {
    export const Custom = <T extends string>(k: T) => k as T & RoleKind;
  }
  export type RoleKind = import('@abuddy/ears').EARS.RoleKind;

  export const AttrKindValues = { Role: 'role', RelationDetails: 'relationDetails' } as const;
  export namespace AttrKind {
    export const Role = 'role';
    export type Role = typeof Role;
    export const RelationDetails = 'relationDetails';
    export type RelationDetails = typeof RelationDetails;
    export const Custom = <T extends string>(k: T) => k as T & AttrKind;
  }
  export type AttrKind = import('@abuddy/ears').EARS.AttrKind;

  export type Blueprint = import('@abuddy/ears').EARS.Blueprint;
  export type RelationDetail = import('@abuddy/ears').EARS.RelationDetail;
  export type AttributePayloads = import('@abuddy/ears').EARS.AttributePayloads;
  export type AttributeValue<K extends AttrKind = AttrKind> = import('@abuddy/ears').EARS.AttributeValue<K>;
  export type AttributeTypeMap = import('@abuddy/ears').EARS.AttributeTypeMap;
  export type AttributeStore = import('@abuddy/ears').EARS.AttributeStore;
}

export type BaseEntity = import('@abuddy/ears').BaseEntity;

export const AllEntities = EARS.Entity;
export type AllEntities = EARS.Entity;
`;
}

/** The SDK seeders of the specialty seed keys */
const SPECIALTY_SEEDERS: Record<string, { factory: string; args: string }> = {
  actions: { factory: 'createSeeder', args: `{ key: 'actions', entities: ['Action'], identity: ['label'] }` },
  prompts: { factory: 'createSeeder', args: `{ key: 'prompts', entities: ['Prompt'], identity: ['label'] }` },
  flows: { factory: 'createFlowSeeder', args: '' },
};

const COMPILED_DIR_ACCESSORS = `let _compiledDir = '';
export function setCompiledDir(dir: string): void { _compiledDir = dir; }
export function getCompiledDir(): string {
  if (!_compiledDir) throw new Error('compiledDir not initialized — pack loader must call setCompiledDir()');
  return _compiledDir;
}
`;

// ── Helpers ─────────────────────────────────────────────────────

/** Extensions a manifest path can name a module by; anything else (`memo.types`) is part of the name */
const MODULE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.vue', '.json', '.css']);

/** Extensions of the TypeScript sources codegen reads exports from */
const TS_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

/**
 * Specifier from src/__generated__ to a manifest path (relative to the pack root), with an
 * explicit .js extension so generated code resolves under node16/nodenext as well as bundlers.
 */
function toImportPath(root: string, manifestPath: string): string {
  const normalized = manifestPath.split('\\').join('/');
  const rel = '../' + normalized.replace(/^(\.\/)?src\//, '');
  const ext = extname(rel);
  if (ext === '.ts' || ext === '.tsx' || ext === '.mts' || ext === '.cts') {
    return rel.slice(0, -ext.length) + { '.ts': '.js', '.tsx': '.js', '.mts': '.mjs', '.cts': '.cjs' }[ext];
  }
  if (MODULE_EXTENSIONS.has(ext)) return rel;
  if (!existsSync(join(root, `${normalized}.ts`)) && existsSync(join(root, normalized, 'index.ts'))) {
    return `${rel}/index.js`;
  }
  return `${rel}.js`;
}


/** This pack's entities with no shape (in entityShapes or the SDK's), whose fields read as unknown values */
export function entitiesWithoutShapes(manifest: Pick<PackManifest, 'entities' | 'entityShapes'>): string[] {
  return Object.keys(manifest.entities ?? {})
    .filter((entity) => !(entity in (manifest.entityShapes ?? {})) && !(SDK_SHAPED_ENTITIES as readonly string[]).includes(entity));
}

/** The type-bundle key in a pack's snapshot defs, written by `abuddy build` */
export const PACK_TYPES_DEF = 'pack-types';

/**
 * A dependency's facade types in a pack, relative to the pack root.
 *
 * @internal Host-only: abuddy CLI build tooling.
 */
export function _depTypesFile(depId: string): string {
  return `src/__generated__/deps/${depId}.d.ts`;
}

const FLOW_HELPERS_SUFFIX = '.flow-helpers';

/** A dependency's flow helpers module (`.js`) or its declarations (`.d.ts`) in a pack, relative to the pack root */
function depFlowHelpersFile(depId: string, extension: '.js' | '.d.ts'): string {
  return `src/__generated__/deps/${depId}${FLOW_HELPERS_SUFFIX}${extension}`;
}

/** The line naming the dependency version a facade types file was generated from */
function depTypesHeader(depId: string, version: string): string {
  return `// ${depId}@${version} facade types\n`;
}

/**
 * The dependency version a facade types file was generated from (its depTypesHeader line).
 *
 * @internal Host-only: abuddy CLI build tooling.
 */
export function _depTypesVersion(content: string, depId: string): string | undefined {
  const prefix = `// ${depId}@`;
  const suffix = ' facade types';
  const line = content.split('\n').find((l) => l.startsWith(prefix) && l.endsWith(suffix));
  return line?.slice(prefix.length, -suffix.length);
}

/** A local name for a type imported from a dependency, unique per dependency */
function depAlias(depId: string, name: string): string {
  return `__dep_${depId.replace(/[^A-Za-z0-9_$]/g, '_')}_${name}`;
}

function toIdentifier(key: string): string {
  return key.replace(/\W/g, '_');
}

function toPascalCase(id: string): string {
  return id.replace(/(^|-)(\w)/g, (_, _sep, c) => c.toUpperCase());
}

// Local bindings for a feature's default exports start with `__`, which a feature id can't, so they don't
// collide with generated names (`specs`, `ref`, `<feature>Entry`).
const settingsBinding = (id: string) => `__settings_${toPascalCase(id)}`;
const systemBinding = (id: string) => `__system_${id}`;
const pluginBinding = (id: string) => `__plugin_${id}`;

export interface GenerateEntriesOptions {
  packRoot: string;
  depTypes?: Map<string, PackTypeManifest>;
  depSnapshots?: Map<string, PackSnapshot>;
}

export function generatePackFiles(
  manifest: PackManifest,
  opts: GenerateEntriesOptions,
): Record<string, string> {
  const root = opts.packRoot;
  const depSnapshots = opts.depSnapshots ?? new Map<string, PackSnapshot>();
  const depIds = [...depSnapshots.keys()];
  /** `import type { name as alias }` from each dependency's facade, and the aliases */
  function depTypeImports(name: string): { imports: string[]; aliases: string[] } {
    return {
      imports: depIds.map((depId) => `import type { ${name} as ${depAlias(depId, name)} } from './deps/${depId}.js';`),
      aliases: depIds.map((depId) => depAlias(depId, name)),
    };
  }

  /**
   * The slash commands the pack declares. A name a dependency declares too fails the build: the app would
   * refuse to register the pack.
   */
  function declaredCommands(): NonNullable<PackManifest['commands']> {
    const commands = manifest.commands ?? [];
    const taken = _mergeProvenance('commands', [...depSnapshots]);
    for (const { name } of commands) {
      const owner = taken[name];
      if (owner) {
        throw new Error(`Command "${name}" is declared by "${owner}", which this pack depends on: the app refuses a pack whose command another pack declares, so rename it in abuddy.json \`commands\``);
      }
    }
    return commands;
  }
  const commands = declaredCommands();

  /**
   * The repository names the pack's direct dependencies declare, with the pack declaring each. A name
   * this pack declares too fails the build: the app's registry refuses a pack whose repository name
   * another registered pack holds, so the pack would build and then break the app at registration.
   */
  function checkRepositoryNames(): void {
    const taken = new Map<string, string>();
    for (const [depId, snap] of depSnapshots) {
      for (const feature of snap.manifest.features ?? []) {
        for (const name of Object.keys(feature.repositories ?? {})) taken.set(name, depId);
      }
    }
    for (const feature of manifest.features ?? []) {
      for (const name of Object.keys(feature.repositories ?? {})) {
        const owner = taken.get(name);
        if (owner) {
          throw new Error(`Repository "${name}" (feature "${feature.id}") is declared by "${owner}", which this pack depends on: the app refuses a pack whose repository name another pack registered, so rename it in abuddy.json \`repositories\``);
        }
      }
    }
  }
  checkRepositoryNames();

  /**
   * The same rule for service names, in both directions.
   *
   * A pack's generated `Services` is the intersection of its dependencies' (`_S0 & _S1 & …`), and an
   * intersection is silent about a collision: two dependencies both providing `db` give
   * `db: A['db'] & B['db']`, a type that is usually unusable and sometimes `never`, with no error
   * anywhere. The app's registry does refuse the second pack at registration, so the collision
   * surfaces — at app start, far from the pack that caused it. This reports it at build time, where
   * commands and repositories are already reported.
   */
  function checkServiceNames(): void {
    const serviceNames = (m: PackManifest): string[] => [
      ...Object.keys(m.packServices ?? {}),
      ...(m.features ?? []).flatMap((f) => Object.keys(f.services ?? {})),
    ];
    const taken = new Map<string, string>();
    for (const [depId, snap] of depSnapshots) {
      for (const name of serviceNames(snap.manifest)) {
        const owner = taken.get(name);
        if (owner && owner !== depId) {
          throw new Error(`Service "${name}" is declared by both "${owner}" and "${depId}", which this pack depends on: their services are intersected into one \`services\`, so the two would silently merge. Only one of them can provide it.`);
        }
        taken.set(name, depId);
      }
    }
    for (const name of serviceNames(manifest)) {
      const owner = taken.get(name);
      if (owner) {
        throw new Error(`Service "${name}" is declared by "${owner}", which this pack depends on: the app refuses a pack whose service name another pack registered, so rename it in abuddy.json \`services\``);
      }
    }
  }
  checkServiceNames();

  // ── Manifest export targets ────────────────────────────────────

  /** The pack source file a manifest path names: the file itself, `<path>.ts` or `<path>/index.ts` */
  function sourceFileOf(manifestPath: string): string | undefined {
    const normalized = manifestPath.split('\\').join('/');
    return [normalized, `${normalized}.ts`, `${normalized}/index.ts`]
      .map((candidate) => join(root, candidate))
      .find((file) => TS_SOURCE_EXTENSIONS.has(extname(file)) && existsSync(file) && statSync(file).isFile());
  }

  /** A `"path#exportName"` manifest value: the source path, the export and the file */
  function exportTarget(label: string, target: string): { source: string; exportName: string; file: string } {
    const hash = target.indexOf('#');
    if (hash === -1) throw new Error(`${label}: "${target}" must name its export, as "path#exportName"`);
    const source = target.slice(0, hash).split('\\').join('/');
    const exportName = target.slice(hash + 1);
    const file = sourceFileOf(source);
    if (!file) throw new Error(`${label}: no file found at ${source} (.ts or /index.ts)`);
    return { source, exportName, file };
  }

  /** Every file whose exports codegen reads, so one TypeScript program covers them all */
  function exportedFromFiles(): string[] {
    const features = manifest.features ?? [];
    const targets = [
      ...features.flatMap((f) => [...Object.values(f.services ?? {}), ...Object.values(f.repositories ?? {})]),
      ...Object.values(manifest.packServices ?? {}),
      ...Object.values(manifest.seedHooks ?? {}),
      ...(manifest.settingsSections ? [manifest.settingsSections] : []),
      ...(manifest.help ? [manifest.help] : []),
    ].map((target) => target.split('#')[0]);
    const sources = [
      ...targets,
      ...Object.values(manifest.entityShapes ?? {}).map((shape) => shape.source),
      ...features.flatMap((f) => (f.settings ? [f.settings] : [])),
      // The systems' entries: their outgoing unions are one of the two sources of a plugin's inbox
      ...features.flatMap((f) => (f.system ? [f.system.entry] : [])),
      // The plugins' entries, and the contract leaves beside them: a plugin's inbox is read from its contract,
      // which lives in a module the plugin's own machine never imports
      ...features.flatMap((f) => (f.plugin ? [f.plugin.entry] : [])),
      ...features.flatMap((f) => (f.plugin?.contract ? [f.plugin.contract.split('#')[0]!] : [])),
    ];
    return [...new Set(sources.map(sourceFileOf).filter((file): file is string => file !== undefined))];
  }

  let moduleExports: ModuleExports | undefined;
  function exportOf(file: string, name: string): ExportInfo | undefined {
    moduleExports ??= createModuleExports(root, exportedFromFiles());
    return moduleExports.exportOf(file, name);
  }

  function outgoingEventTypesOf(file: string): string[] {
    moduleExports ??= createModuleExports(root, exportedFromFiles());
    return moduleExports.outgoingEventTypesOf(file);
  }

  function inboxEventTypesOf(file: string, name: string): string[] {
    moduleExports ??= createModuleExports(root, exportedFromFiles());
    return moduleExports.inboxEventTypesOf(file, name);
  }

  /** The event types a feature's system sends, read from its spec */
  function sentEventTypes(feature: PackFeatureEntry): string[] {
    const file = sourceFileOf(feature.system!.entry);
    if (!file) throw new Error(`Feature "${feature.id}": no system entry found at ${feature.system!.entry} (.ts or /index.ts)`);
    try {
      return outgoingEventTypesOf(file);
    } catch (err) {
      // The same error, so its code still says what kind of failure it is
      (err as Error).message = `Feature "${feature.id}": ${(err as Error).message}`;
      throw err;
    }
  }

  /**
   * A feature's declared contract, as `abuddy.json` names it at `features[].plugin.contract` — the module and the
   * type in it. A feature that names none publishes nothing: its plugin still receives its own system's events.
   *
   * The contract is a *type*, so the check is that the module declares one: a name that is only a value is the
   * mistake worth catching, since reading it would silently yield an empty inbox.
   */
  function contractOf(feature: PackFeatureEntry): { source: string; exportName: string; file: string } | undefined {
    if (!feature.plugin?.contract) return undefined;
    const label = `Feature "${feature.id}": plugin.contract`;
    const target = exportTarget(label, feature.plugin.contract);
    const info = exportOf(target.file, target.exportName);
    if (!info) throw new Error(`${label}: ${target.source} doesn't export "${target.exportName}"`);
    if (!info.type) throw new Error(`${label}: ${target.source} exports "${target.exportName}" only as a value, not a type. A plugin's contract is a declared type codegen reads without running anything`);
    return target;
  }

  /** The event types a plugin's contract declares that any other plugin or system may send it */
  function acceptedEventTypes(feature: PackFeatureEntry): string[] {
    const contract = contractOf(feature);
    if (!contract) return [];
    try {
      return inboxEventTypesOf(contract.file, contract.exportName);
    } catch (err) {
      // The same error, so its code still says what kind of failure it is
      (err as Error).message = `Feature "${feature.id}": ${(err as Error).message}`;
      throw err;
    }
  }

  /**
   * The event types one of this pack's plugins receives: what its own feature's system sends it, and every audience
   * of the inbox its contract declares. The bus checks each send against this (`getPluginEventValidationMap`).
   *
   * One flat list, deliberately: the audiences are a type-level split, and a passing check here means the event's
   * **shape** was accepted, not that this sender was allowed to send it. `Message` carries no sender today, so the
   * bus has nothing to compare an audience against — see the goal's Deferred item, which has the trigger for
   * stamping one.
   */
  function receivedEventTypes(feature: PackFeatureEntry): string[] {
    const own = feature.system ? sentEventTypes(feature) : [];
    return [...new Set([...own, ...acceptedEventTypes(feature)])].sort();
  }

  /** A `"path#exportName"` target that must export a runtime value */
  function valueExport(label: string, target: string): { source: string; exportName: string; value: NonNullable<ExportInfo['value']> } {
    const { source, exportName, file } = exportTarget(label, target);
    const info = exportOf(file, exportName);
    if (!info) throw new Error(`${label}: ${source} doesn't export "${exportName}"`);
    if (!info.value) throw new Error(`${label}: ${source} exports "${exportName}" only as a type, not a value`);
    return { source, exportName, value: info.value };
  }

  /** A service: `"path#exportName"` of the service object (an object literal or a class instance) */
  function serviceExport(key: string, target: string): { source: string; exportName: string } {
    const label = `Service "${key}"`;
    const { source, exportName, value } = valueExport(label, target);
    if (value === 'function') throw new Error(`${label}: "${exportName}" in ${source} is a function; export the service object itself (export const ${exportName} = { … })`);
    if (value === 'class') throw new Error(`${label}: "${exportName}" in ${source} is a class; export an instance of it (export const <name> = new …)`);
    return { source, exportName };
  }

  /** A feature's settings module, imported by its default export */
  function settingsSource(feature: PackFeatureEntry): string {
    const label = `Feature "${feature.id}"`;
    const file = sourceFileOf(feature.settings!);
    if (!file) throw new Error(`${label}: no settings file found at ${feature.settings} (.ts or /index.ts)`);
    if (!exportOf(file, 'default')?.value) throw new Error(`${label}: settings ${feature.settings} has no default export of the settings object`);
    return feature.settings!;
  }

  function typesEntry(feature: PackFeatureEntry): string {
    return feature.typesEntry ?? `src/features/${feature.id}/be/types`;
  }

  const stepsRegister = manifest.steps?.register;

  const stepDefinitions: StepEntry[] = manifest.steps?.definitions ?? [];

  // ── Backend entry ──────────────────────────────────────────────

  function generateBackendEntry(): string {
    const features = manifest.features ?? [];
    const systemFeatures = features.filter(f => f.system);
    // Every system's events are read, a system without a plugin's too: an entry that lost them (annotated
    // `: SystemEntry`) would give the facade types nothing but `{ type: string }`
    for (const feature of systemFeatures) sentEventTypes(feature);

    const systemImports = systemFeatures
      .map(f => `import ${systemBinding(f.id)} from '${toImportPath(root, f.system!.entry)}';`)
      .join('\n');

    const systemExpr = (f: PackFeatureEntry): string => {
      const options = [
        ...(f.system!.events?.incoming?.length ? [`incoming: ${JSON.stringify(f.system!.events.incoming)}`] : []),
        ...(f.earlySystem ? ['early: true'] : []),
      ];
      return `packSystem(${systemBinding(f.id)}${options.length ? `, { ${options.join(', ')} }` : ''})`;
    };

    const featuresLiteral = features.map(f => {
      const parts: string[] = [];
      if (f.designation) parts.push(`      designation: '${f.designation}'`);
      if (f.system) parts.push(`      system: ${systemExpr(f)}`);
      if (f.plugin) parts.push(`      plugin: { receives: [${receivedEventTypes(f).map((type) => `'${type}'`).join(', ')}] }`);
      parts.push(`      services: [${Object.keys(f.services ?? {}).map(s => `'${s}'`).join(', ')}]`);
      if (f.settings) parts.push(`      settings: ${settingsBinding(f.id)}`);
      return `    '${f.id}': {\n${parts.join(',\n')},\n    }`;
    }).join(',\n');

    const settingsImports = features
      .filter(f => f.settings)
      .map(f => `import ${settingsBinding(f.id)} from '${toImportPath(root, settingsSource(f))}';`)
      .join('\n');

    const hooksImport = manifest.boot?.hooks
      ? `import * as _hooks from '${toImportPath(root, manifest.boot.hooks)}';`
      : '';

    const seedKeysList = seededKeys().map(k => JSON.stringify(k)).join(', ');
    const hookEntries = seedHookEntries();
    // The pack's settings sections: a function returning them, called the first time the defaults are read
    const sections = manifest.settingsSections
      ? valueExport('settingsSections', manifest.settingsSections)
      : undefined;
    // The pack's help entries, called the first time the Settings view's Help list is read
    const help = manifest.help ? valueExport('help', manifest.help) : undefined;
    const seedPolicy = manifest.boot?.seedPolicy;
    const seedPolicyLine = seedPolicy ? `\n      seedPolicy: ${JSON.stringify(seedPolicy)},` : '';

    return `${HEADER}
import type { PackRegistration } from '@abuddy/sdk/framework';
${systemFeatures.length ? "import { packSystem } from '@abuddy/sdk/framework';\n" : ''}${hasRepositories() ? "import { repositories } from './repositories.js';\n" : ''}
${systemImports}
import { featureServices } from './services.js';
import { EARS } from './ears.js';
${hooksImport}
${hookEntries.map(([, path, exportName], i) => `import { ${exportName} as __seedHooks_${i} } from '${path}';`).join('\n')}
${settingsImports}
${manifest.migrations ? `import { migrations } from '${toImportPath(root, manifest.migrations)}';` : ''}
${stepsRegister ? `import { steps } from '${toImportPath(root, stepsRegister)}';` : ''}
${manifest.artifacts ? `import { artifacts } from '${toImportPath(root, manifest.artifacts)}';` : ''}
${manifest.blocks ? `import { blocks } from '${toImportPath(root, manifest.blocks)}';` : ''}
import { getCompiledDir, seeders } from './seeders.js';
export { setCompiledDir } from './seeders.js';
${sections ? `import { ${sections.exportName} as __settingsSections } from '${toImportPath(root, sections.source)}';` : ''}
${help ? `import { ${help.exportName} as __help } from '${toImportPath(root, help.source)}';` : ''}

export const registration: PackRegistration = {
  id: '${manifest.id}',
  features: {${featuresLiteral ? `\n${featuresLiteral},\n  ` : ''}},
  services: featureServices,
${hasRepositories() ? '  repositories,' : ''}
${stepsRegister ? '  steps,' : ''}
${manifest.artifacts ? '  artifacts,' : ''}
${manifest.blocks ? '  blocks,' : ''}
${hookEntries.length > 0 ? `  seedHooks: { ${hookEntries.map(([entity], i) => `${JSON.stringify(entity)}: __seedHooks_${i}`).join(', ')} },` : ''}
  seeders,
${commands.length ? `  commands: ${JSON.stringify(commands)},` : ''}
${sections ? '  settingsSections: __settingsSections,' : ''}
${help ? '  help: __help,' : ''}
  ears: {
    // Only this pack's own: EARS also names its dependencies' and the SDK's, which they register
    entities: ${JSON.stringify(manifest.entities ?? {})},
    relKinds: ${JSON.stringify(manifest.relKinds ?? {})},
    partitionPolicy: {
      excludedEntityTypes: ${JSON.stringify(manifest.partitionPolicy?.excludedEntityTypes ?? [])},
    },
  },
  boot: {
${manifest.boot?.hooks ? '    ..._hooks,' : ''}
    seedManifest: {
      seedKeys: [${seedKeysList}],
      get compiledDir() { return getCompiledDir(); },${seedPolicyLine}
    },
  },
${manifest.migrations ? '  migrations,' : ''}
};
`;
  }

  // ── Frontend entry ─────────────────────────────────────────────

  function generateFrontendEntry(): string {
    const features = manifest.features ?? [];
    const pluginFeatures = features.filter(f => f.plugin);

    // The plugin module is passed through as the author wrote it, keyed by its feature as the backend entry is: the
    // host registers it at the feature's ref, with the feature's role
    const pluginImports = pluginFeatures
      .map(f => `import ${pluginBinding(f.id)} from '${toImportPath(root, f.plugin!.entry)}';`)
      .join('\n');
    // The feature whose plugin claims it, else the pack's first
    const defaultFeature = pluginFeatures.find(f => f.plugin?.default) ?? pluginFeatures[0];
    // A designated feature with no plugin is listed for its role, so a frontend send to that role resolves
    const featureEntries = features.filter((f) => f.plugin || f.designation).map((f) => {
      const parts = f.plugin ? [`plugin: ${pluginBinding(f.id)}`] : [];
      if (f.designation) parts.push(`designation: '${f.designation}'`);
      if (f === defaultFeature) parts.push('default: true');
      return `    '${f.id}': { ${parts.join(', ')} },\n`;
    }).join('');

    const fe = manifest.fe ?? {};

    const feExts: Record<string, string> = {};
    for (const field of ['steps', 'artifacts', 'blocks'] as const) {
      const manifestField = manifest[field];
      if (!manifestField) continue;
      const pathStr = typeof manifestField === 'string' ? manifestField : manifestField.register;
      const fePath = pathStr.replace(/\.ts$/, '-fe.ts');
      if (!existsSync(join(root, fePath))) continue;
      feExts[field] = toImportPath(root, fePath);
    }

    const extraImports: string[] = [];
    if (fe.tiptapPlugins) {
      extraImports.push(`import { tiptapPlugins } from '${toImportPath(root, fe.tiptapPlugins)}';`);
    }
    for (const field of ['artifacts', 'blocks', 'steps'] as const) {
      if (feExts[field]) {
        extraImports.push(`import { ${field}FE } from '${feExts[field]}';`);
      }
    }
    const appExt = Object.entries(fe.appExtensions ?? {});
    for (const [key, extPath] of appExt) {
      extraImports.push(`import __appExtension_${key} from '${toImportPath(root, extPath)}';`);
    }

    const regProps: string[] = [];
    if (feExts.steps) regProps.push(`  steps: stepsFE,`);
    if (fe.tiptapPlugins) regProps.push(`  tiptapPlugins,`);
    if (appExt.length) {
      const extObj = appExt.map(([key]) => `${key}: __appExtension_${key}`).join(', ');
      regProps.push(`  appExtensions: { ${extObj} },`);
    }
    if (feExts.artifacts) regProps.push(`  artifacts: artifactsFE,`);
    if (feExts.blocks) regProps.push(`  blocks: blocksFE,`);

    if (monacoDslEntries().length > 0) {
      extraImports.push(`import { dslTypes } from './dsl-types-fe.js';`);
      regProps.push(`  dslTypes,`);
    }

    return `${HEADER}
import type { PackFERegistration } from '@abuddy/sdk/fe';
${pluginImports}
${extraImports.join('\n')}

export default {
  id: '${manifest.id}',
  features: {${featureEntries ? `\n${featureEntries}  ` : ''}},
${regProps.join('\n')}
} satisfies PackFERegistration;
`;
  }

  // ── Registries ────────────────────────────────────────────────

  // The generated PackShapes, EntityName and Node override are part of the typed EARS contract
  // (packages/abuddy-sdk/TYPED-EARS.md)
  function packRegistry() {
    let depTypes = opts.depTypes;
    if (!depTypes) {
      depTypes = new Map<string, PackTypeManifest>();
      for (const [id, snap] of depSnapshots) depTypes.set(id, snap.types);
    }
    const depProvenance = new Map([...depSnapshots].map(([id, snap]) => [id, snap.provenance ?? {}] as const));
    return mergeRegistries(manifest.id, manifest, depTypes, depProvenance);
  }

  function generateEars(): string {
    const registry = packRegistry();
    const { imports: shapeImports, entries: shapeEntries } = entityShapeEntries();
    const depShapes = depTypeImports('PackEntityShapes');
    // The type names rows carry (the values; abuddy.json requires each key to equal its value)
    const entityNames = [...registry.entities.values()].map(({ value }) => `'${value}'`);
    const ownNodes = stepNodeTypes().length > 0;
    // Each dependency's facade names its step node types (never when it defines none)
    const depNodes = depTypeImports('PackStepNodes');
    const packNodes = [ownNodes ? 'NodeEntity' : 'never', ...depNodes.aliases].join(' | ');
    return `${emitEARS(manifest.id, registry)}
// ── Typed EARS helpers ──────────────────────────────────────────
// The query helpers typed against this pack's entity shapes (its own and its
// dependencies'). The call is pure, so bundles that only use the EARS constants above
// drop it.

import { defineEars, type ShapeOf } from '@abuddy/ears';
import type { SdkEntityShapes } from '@abuddy/sdk';
${ownNodes ? "import type { NodeEntity } from './types.js';\n" : ''}${shapeImports.join('\n')}

${[...depShapes.imports, ...depNodes.imports].join('\n')}

/** Entity shapes this pack declares */
export type OwnEntityShapes = {
${shapeEntries.join('\n')}
};

/** The step node types of this pack and its dependencies; never when none defines one */
export type PackStepNodes = ${packNodes};

/**
 * Every entity shape this pack can read: the SDK's, its own and its dependencies'. Node is the union of
 * the step node types (NodeBase when no step defines one), not an intersection of each pack's.
 */
export type PackShapes = Omit<SdkEntityShapes & OwnEntityShapes${depShapes.aliases.map((a) => ` & ${a}`).join('')}, 'Node'> & {
  Node: [PackStepNodes] extends [never] ? SdkEntityShapes['Node'] : PackStepNodes;
};

/** An entity type's shape in this pack; undeclared types read as base fields plus \`unknown\` values. */
export type EntityShape<E extends string> = ShapeOf<PackShapes, E>;

/**
 * Entity names the helpers below accept as literals: this pack's, its dependencies' and the SDK's. A name
 * known only at runtime (typed \`string\`) is accepted unchecked.
 */
export type EntityName = ${entityNames.join(' | ')};

export const {
  qx, tx, findById, findByIdRaw, findAll, findWhere, findFirst,
  findWithFields, findByIdWithFields, findWithRole, findFirstWithRole,
  createEntity, createEntityWithDefaults, updateEntity, getAttr, getAttrs,
} = /*#__PURE__*/ defineEars<PackShapes, EntityName>();
`;
  }

  // `ref(name)`, the ref a name in this pack's code stands for, bound to the pack as the generated sends are, so
  // pack code never supplies its own pack id. It takes only the names the pack can write, so a misspelled one doesn't
  // compile (a FeatureRef is accepted wherever a send takes one). Frontend-safe: it imports only `@abuddy/sdk/ids`.
  function generateRef(): string {
    const names = [...new Set([
      ...(manifest.features ?? []).map((f) => f.id),
      ...[...depSnapshots].flatMap(([depId, snap]) => (snap.manifest.features ?? []).map((f) => `${depId}/${f.id}`)),
      ...Object.keys(_mergeProvenance('plugins', [...depSnapshots])),
      ...Object.keys(HOST_PLUGIN_EVENT_TYPES),
      ...Object.keys(HOST_SYSTEM_EVENT_TYPES),
    ])];
    return `${HEADER}
import { resolveName, type FeatureRef } from '@abuddy/sdk/ids';

/** A feature this pack's code can name: its own by feature id, its dependencies' and the host's as \`<packId>/<featureId>\` */
export type FeatureName = ${names.map((name) => `'${name}'`).join(' | ')};

/** The ref of a feature this pack's code names */
export const ref = (name: FeatureName): FeatureRef => resolveName(name, '${manifest.id}');
`;
  }

  // Frontend helpers that take the names this pack's code writes: its own plugins by feature id, those its
  // dependencies declare as `<packId>/<featureId>`. Kept apart from events.ts, which backend systems import,
  // because these reach the frontend SDK.
  function generateFe(): string {
    const features = manifest.features ?? [];
    const pluginFeatures = features.filter(f => f.plugin);
    const own = pluginFeatures.map(f => f.id);
    if (!own.length) return '';
    const plugins = [...own, ...Object.keys(_mergeProvenance('plugins', [...depSnapshots])).sort()].map(name => `'${name}'`);

    // Each own plugin's published state, from the same contract the inbox is read from. A feature that declares no
    // contract publishes nothing, and `never` is what a selector for it gets.
    const declaring = pluginFeatures.map(f => ({ feature: f, contract: contractOf(f) })).filter(c => c.contract);
    const stateImports = declaring
      .map(({ feature, contract }) => `import type { ${contract!.exportName} as __state_contract_${feature.id} } from '${toImportPath(root, contract!.source)}';`)
      .join('\n');
    const declaredIds = new Set(declaring.map(c => c.feature.id));
    const ownState = pluginFeatures
      .map(f => `  '${f.id}': ${declaredIds.has(f.id) ? `PluginStateOf<__state_contract_${f.id}>` : 'never'};`)
      .join('\n');
    const depState = depTypeImports('PackPluginState');
    const qualifiedState = depIds.map((depId) => `Qualified<'${depId}', ${depAlias(depId, 'PackPluginState')}>`);

    return `${HEADER}
import { openPlugin, pluginIsRunning, readUntypedPluginState, useUntypedPluginState, type PluginStateOf } from '@abuddy/sdk/fe';
import type { Qualified } from '@abuddy/sdk/events';
import type { Ref } from 'vue';
import type { SendablePluginEvents } from './events.js';
import { ref } from './ref.js';
${stateImports}
${depState.imports.join('\n')}

/**
 * A plugin as this pack's code names it: its own by feature id, a dependency's as \`<packId>/<featureId>\`.
 * A plugin named by data (a link's target, a registered plugin's \`id\`) opens through \`openPlugin\`
 * from \`@abuddy/sdk/fe\`, which checks it at runtime instead.
 */
export type PluginName = ${plugins.join(' | ')};

/** Feature id → the state this pack's plugin for that feature publishes (dependents name it \`${manifest.id}/<feature>\`). */
export type PackPluginState = {
${ownState}
};

/** A plugin of this pack, whose actor is running whenever this pack's frontend is */
export type OwnPluginName = keyof PackPluginState & string;
${qualifiedState.length > 0 ? `
/** A dependency's plugin, whose frontend may still be loading */
type DependencyPluginState = ${qualifiedState.join(' & ')};
export type DependencyPluginName = keyof DependencyPluginState & string;
` : ''}
/**
 * Opens a plugin and hands its actor \`event\` once it's running; throws if no such plugin is registered.
 *
 * The events are the target's inbox, the same one \`sendToPlugin\` takes — this delivers to that plugin's actor
 * too, so leaving it open would be a second, unchecked door to what the inbox exists to declare. A pack's own
 * plugins take their own feature's system's events as well, so a UI command a machine handles
 * (\`FLOW.SELECT\`, \`TAB.CREATE\`) needs declaring only where another pack sends it.
 */
export function navigateToPlugin<Name extends PluginName>(
  name: Name,
  event?: SendablePluginEvents[Name] | SendablePluginEvents[Name][],
): void {
  openPlugin(ref(name), event);
}

const OWN_PLUGINS = new Set<string>([${own.map(id => `'${id}'`).join(', ')}]);

/**
 * The ref to read at, checked where this pack's own plugins are concerned. Their overloads say the value is never
 * \`undefined\` — a plugin of this pack is spawned in the step that registers it, so one that isn't running is a bug
 * rather than a state — and this is what keeps that true, instead of handing back an \`undefined\` the type denies.
 * A dependency's may legitimately not be running yet, and reads as \`undefined\` until its frontend loads.
 */
function ownPlugin(name: PluginName): string {
  const target = ref(name);
  if (OWN_PLUGINS.has(name) && !pluginIsRunning(target)) {
    throw new Error(\`No plugin is running at "\${target}", which is this pack's own: its frontend registers it, so this is a bug rather than a state to render\`);
  }
  return target;
}

/**
 * A value from the state a plugin publishes, followed until the calling scope is disposed — so it runs in a
 * component's setup or an effect scope, never inside a \`computed\`. The selector takes that plugin's published
 * state, not an XState snapshot.
 *
 * This pack's own plugins are spawned in the step that registers them, so one of those is always running and the
 * value is never \`undefined\`. A dependency's frontend may still be loading, so reading one of its plugins gives
 * \`undefined\` until it arrives — that is a state to render, not an error.
 *
 * \`useUntypedPluginState\` from \`@abuddy/sdk/fe\` is the escape hatch, for a ref that arrives as data.
 */
export function usePluginState<Name extends OwnPluginName, TSelected>(name: Name, selector: (state: PackPluginState[Name]) => TSelected): Readonly<Ref<TSelected>>;${qualifiedState.length > 0 ? `
export function usePluginState<Name extends DependencyPluginName, TSelected>(name: Name, selector: (state: DependencyPluginState[Name]) => TSelected): Readonly<Ref<TSelected | undefined>>;` : ''}
export function usePluginState(name: PluginName, selector: (state: never) => unknown): Readonly<Ref<unknown>> {
  return useUntypedPluginState(ownPlugin(name), (snapshot: { context: never }) => selector(snapshot.context));
}

/** The same read, once, for code outside a reactive scope — a machine's action, an event handler. */
export function readPluginState<Name extends OwnPluginName, TSelected>(name: Name, selector: (state: PackPluginState[Name]) => TSelected): TSelected;${qualifiedState.length > 0 ? `
export function readPluginState<Name extends DependencyPluginName, TSelected>(name: Name, selector: (state: DependencyPluginState[Name]) => TSelected): TSelected | undefined;` : ''}
export function readPluginState(name: PluginName, selector: (state: never) => unknown): unknown {
  return readUntypedPluginState(ownPlugin(name), (snapshot: { context: never }) => selector(snapshot.context));
}
`;
  }


  /**
   * Plugin id → the events that plugin receives: what its own feature's system sends it, plus the inbox the
   * plugin's `Contract` declares (`features[].plugin.contract`). Only features that have a plugin get a key: nothing can
   * receive an event sent to a feature that has none.
   *
   * Every dependency's plugins and the host's are addressable with no declaration on this side — the receiver's
   * own `PackPluginEvents` says what it takes, as a system's `PackSystemEvents` does. Only the pack that owns a
   * plugin widens what it receives, since only it can handle a new event, and only the declared half crosses:
   * what passes between a feature's own two halves is nobody else's to send.
   */
  function generateEvents(): string {
    const features = manifest.features ?? [];
    const systemFeatures = features.filter(f => f.system);
    const pluginFeatures = features.filter(f => f.plugin);
    const hasSystems = systemFeatures.length > 0;

    // Each system's sent events, read from its spec: the one place they are declared
    const outgoingAliases = systemFeatures
      .map(f => `type __events_${f.id} = OutgoingEventsOf<(typeof __specs)['${f.id}']>;`)
      .join('\n');
    // Each plugin's declared contract, from the leaf module abuddy.json names — never the plugin module itself,
    // whose machine imports cycle back through this file
    const declaring = pluginFeatures.map(f => ({ feature: f, contract: contractOf(f) })).filter(c => c.contract);
    const acceptsImports = declaring
      .map(({ feature, contract }) => `import type { ${contract!.exportName} as __contract_${feature.id} } from '${toImportPath(root, contract!.source)}';`)
      .join('\n');
    const declaredIds = new Set(declaring.map(c => c.feature.id));
    const acceptsAliases = pluginFeatures
      .flatMap(f => declaredIds.has(f.id)
        ? [`type __accepts_${f.id} = PluginInboxOf<__contract_${f.id}>;`, `type __public_${f.id} = PublicPluginInboxOf<__contract_${f.id}>;`]
        : [`type __accepts_${f.id} = never;`, `type __public_${f.id} = never;`])
      .join('\n');
    // A plugin receives what its own feature's system sends it, and whatever it declares anyone else may send
    const entries = pluginFeatures.map((f) => {
      const ownSystem = systemFeatures.some(s => s.id === f.id) ? [`__events_${f.id}`] : [];
      return `  '${f.id}': ${[...ownSystem, `__accepts_${f.id}`].join(' | ')};`;
    }).join('\n');
    const systemEntries = systemFeatures.map(f => `  '${f.id}': IncomingEventsOf<(typeof __specs)['${f.id}']>;`).join('\n');
    const pack = `'${manifest.id}'`;
    const depPlugins = depTypeImports('PackPluginEvents');
    const depSystems = depTypeImports('PackSystemEvents');
    // Every map keyed by ref; the maps pack code sends with name the pack's own features by bare id instead (`WithOwnNames`)
    const qualifiedPlugins = [
      `Qualified<${pack}, OwnPluginEvents>`,
      ...depIds.map((depId) => `Qualified<'${depId}', ${depAlias(depId, 'PackPluginEvents')}>`),
      'HostPluginEvents',
    ].join(' & ');
    const qualifiedSystems = [
      `Qualified<${pack}, PackSystemEvents>`,
      ...depIds.map((depId) => `Qualified<'${depId}', ${depAlias(depId, 'PackSystemEvents')}>`),
      'HostSystemEvents',
    ].join(' & ');
    return `${HEADER}
import { defineEvents, type HostPluginEvents, type HostSystemEvents, type IncomingEventsOf${hasSystems ? ', type OutgoingEventsOf' : ''}${declaring.length > 0 ? ', type PluginInboxOf, type PublicPluginInboxOf' : ''}, type Qualified, type WithOwnNames } from '@abuddy/sdk/events';
${hasSystems ? `import type { specs as __specs } from './system-specs.js';\n` : ''}${acceptsImports ? `${acceptsImports}\n` : ''}${[...depPlugins.imports, ...depSystems.imports].join('\n')}
${[outgoingAliases, acceptsAliases].filter(Boolean).join('\n')}

/**
 * Plugin id → the events that plugin receives: its own feature's system's, and every audience of the inbox its
 * contract declares. This pack's own sends are checked against it, so a sibling may send the \`pack\` half.
 */
export type OwnPluginEvents = {
${entries}
};

/**
 * Feature id → the \`public\` half of the inbox this pack's plugin declares (dependents name it
 * \`${manifest.id}/<feature>\`). Neither its own system's events nor its \`pack\` audience are here: the first is
 * between the two halves of one feature, the second between this pack's features. What is left is what a dependent
 * pack may send, and it mirrors \`PackSystemEvents\`.
 */
export type PackPluginEvents = {
${pluginFeatures.map(f => `  '${f.id}': __public_${f.id};`).join('\n')}
};

/** Feature id → the events this pack's system for that feature receives (dependents name it \`${manifest.id}/<feature>\`). */
export type PackSystemEvents = {
${systemEntries}
};

/**
 * Every plugin this pack's code can send to, by ref: its own, its dependencies' and the host's. A plugin owned
 * elsewhere takes the inbox its own pack declares — a pack widens only its own. Actions (\`services.emitter\`)
 * send with it.
 */
export type QualifiedPluginEvents = ${qualifiedPlugins};

/** Every system this pack's code can send to, by ref: its own, its dependencies' and the host's. */
export type QualifiedSystemEvents = ${qualifiedSystems};

/** The plugins this pack's code sends to: \`QualifiedPluginEvents\`, with its own named by feature id instead of ref */
export type SendablePluginEvents = WithOwnNames<${pack}, QualifiedPluginEvents>;

/** The systems this pack's code sends to: \`QualifiedSystemEvents\`, with its own named by feature id instead of ref */
export type SendableSystemEvents = WithOwnNames<${pack}, QualifiedSystemEvents>;

export const { broadcastToPlugin, sendToPlugin, sendToSystem } = /*#__PURE__*/ defineEvents<SendablePluginEvents, SendableSystemEvents>('${manifest.id}');
`;
  }

  /** The events each system receives and sends, from its spec; type-only, so facades carry no machines or contexts */
  function generateSystemSpecs(): string {
    const systemFeatures = (manifest.features ?? []).filter(f => f.system);
    if (!systemFeatures.length) return '';
    const imports = systemFeatures.map(f => `import ${systemBinding(f.id)} from '${toImportPath(root, f.system!.entry)}';`).join('\n');
    const specs = systemFeatures.map(f => `  '${f.id}': specEvents(${systemBinding(f.id)}.spec),`).join('\n');
    return `${HEADER}
// Type-only: #generated/events reads the events each system receives and sends from these, by feature id
import { specEvents } from '@abuddy/sdk/events';
${imports}

export const specs = {
${specs}
};
`;
  }

  /** Runtime node entities of this pack's steps: each step's types.ts `interface XNode extends NodeBase` */
  function stepNodeTypes(): Array<{ name: string; importPath: string }> {
    return stepDefinitions
      .map(step => ({ step, file: join(root, step.path, 'types.ts') }))
      .filter(({ file }) => existsSync(file))
      .flatMap(({ step, file }) =>
        [...readFileSync(file, 'utf-8').matchAll(/export\s+interface\s+(\w+)\s+extends\s+NodeBase\b/g)]
          .map(m => ({ name: m[1], importPath: toImportPath(root, step.path + '/types') })));
  }

  function generateTypes(): string {
    // Every feature, not only the ones with a system: the barrel is how one feature names another's types
    // (`#generated/types`), and a feature may have repositories or services and no system at all — whose argument
    // and return types are exactly what its callers need. Having a types module is what decides, below.
    const features = manifest.features ?? [];

    const perFeature = features.map(f => {
      const lines: string[] = [];
      const tPath = typesEntry(f);
      const fullTypesPath = join(root, tPath) + (tPath.endsWith('.ts') ? '' : '.ts');
      if (existsSync(fullTypesPath)) {
        lines.push(`export type * from '${toImportPath(root, tPath)}';`);
      }
      const exportTypesPath = tPath.replace(/types$/, 'export-types');
      const fullExportTypesPath = join(root, exportTypesPath) + '.ts';
      if (existsSync(fullExportTypesPath)) {
        lines.push(`export type * from '${toImportPath(root, exportTypesPath)}';`);
      }
      return lines.join('\n');
    }).filter(Boolean).join('\n\n');

    const nodeTypes = stepNodeTypes();
    const nodeEntity = nodeTypes.length
      ? `${nodeTypes.map(n => `import type { ${n.name} } from '${n.importPath}';`).join('\n')}\n\n` +
        "/** Discriminated union (on `nodeType`) of this pack's step node entities. */\n" +
        `export type NodeEntity = ${nodeTypes.map(n => n.name).join(' | ')};\n`
      : '';

    // Only this pack's own types: SDK types are imported from the SDK
    return `${HEADER}
${perFeature}
${nodeEntity}`;
  }

  function generateServices(): string {
    const features = manifest.features ?? [];
    const packServices = manifest.packServices ?? {};
    const imports: string[] = [];
    const entries: string[] = [];

    // Imports are aliased so a service name can't shadow a generated binding (e.g. `services`)
    function addService(key: string, target: string) {
      const { source, exportName } = serviceExport(key, target);
      const local = `__service_${key}`;
      imports.push(`import { ${exportName} as ${local} } from '${toImportPath(root, source)}';`);
      entries.push(`  ${key}: ${local},`);
    }

    for (const f of features) {
      for (const [key, svcPath] of Object.entries(f.services ?? {})) {
        addService(key, svcPath);
      }
    }

    for (const [key, svcPath] of Object.entries(packServices)) {
      addService(key, svcPath);
    }

    const deps = depTypeImports('Services');

    return `${HEADER}
import type { z } from 'zod';
import type { EARS } from '@abuddy/ears';
import { services as sdkServices, type HostServices } from '@abuddy/sdk/services';
import type { TypedSendToPlugin, TypedSendToSystem } from '@abuddy/sdk/events';
import type { Repositories } from './repository.js';
import type { QualifiedPluginEvents, QualifiedSystemEvents } from './events.js';
${imports.join('\n')}
${deps.imports.join('\n')}

export const featureServices = {
${entries.join('\n')}
};

/**
 * \`services.emitter\`, typed with this pack's events. Actions run outside any pack, so a system and a
 * plugin are both named \`<pack>/<feature>\`, this pack's own and the host's too; a system may also be a role.
 */
export type PackEmitter = Omit<HostServices['emitter'], 'broadcastToPlugin' | 'sendToSystem'> & {
  broadcastToPlugin: TypedSendToPlugin<QualifiedPluginEvents>;
  sendToSystem: TypedSendToSystem<QualifiedSystemEvents>;
};

/**
 * What an action actually receives: this pack's feature services, its dependencies' services
 * and the ambient ones the host injects (logger, emitter, repository).
 * The featureServices value itself stays feature-only.
 */
export type Services = typeof featureServices & Omit<HostServices, 'repository' | 'emitter'> & { repository: Repositories; emitter: PackEmitter }${deps.aliases.map(a => ` & Omit<${a}, 'repository' | 'emitter'>`).join('')};

/** The host's services proxy, typed with this pack's feature services. */
export const services = sdkServices as unknown as Services;
export type Z = typeof z;
export type EntityId = EARS.EntityId;
`;
  }

  // ── Repositories ──────────────────────────────────────────────

  /** [name, source module specifier, export name] of each repository the manifest declares */
  function repositoryEntries(): [string, string, string][] {
    const seen = new Map<string, string>();
    return (manifest.features ?? []).flatMap(f => Object.entries(f.repositories ?? {}).map(([name, target]) => {
      if (seen.has(name)) throw new Error(`Repository "${name}" is declared by features "${seen.get(name)}" and "${f.id}"`);
      seen.set(name, f.id);
      const { source, exportName } = valueExport(`Repository "${name}" (feature "${f.id}")`, target);
      return [name, toImportPath(root, source), exportName] as [string, string, string];
    }));
  }

  function hasRepositories(): boolean {
    return (manifest.features ?? []).some(f => Object.keys(f.repositories ?? {}).length > 0);
  }

  /** `repository`, typed with this pack's repositories and its dependencies'. Type-only imports: no cycles. */
  function generateRepository(): string {
    const entries = repositoryEntries();
    const deps = depTypeImports('Repositories');
    return `${HEADER}
import { repository as earsRepository } from '@abuddy/ears';
${entries.map(([name, path, exportName]) => `import type { ${exportName} as __repo_${name} } from '${path}';`).join('\n')}
${deps.imports.join('\n')}

/** The repositories this pack declares (abuddy.json features[].repositories) */
export type OwnRepositories = {
${entries.map(([name]) => `  ${name}: typeof __repo_${name};`).join('\n')}
};

/** Every repository this pack can use: its own and its dependencies' */
export type Repositories = OwnRepositories${deps.aliases.map(a => ` & ${a}`).join('')};

export const repository = earsRepository as unknown as Repositories;
`;
  }

  /** This pack's repositories by name, which its registration carries (the host registers them with the app's engine) */
  function generateRepositories(): string {
    const entries = repositoryEntries();
    if (entries.length === 0) return '';
    return `${HEADER}
${entries.map(([name, path, exportName]) => `import { ${exportName} as __repo_${name} } from '${path}';`).join('\n')}

export const repositories: Record<string, unknown> = {
${entries.map(([name]) => `  ${name}: __repo_${name},`).join('\n')}
};
`;
  }

  /**
   * The pack's seed runtime (entity types, relation kinds, repositories, seed hooks), what seeding its
   * entity types needs outside the app. \`abuddy build\` bundles it into dist/build/seed-runtime.mjs for
   * dependents' unit tests; the pack's own tests import it from #generated/seed-runtime.
   */
  function generateSeedRuntime(): string {
    const repositories = repositoryEntries();
    const hooks = seedHookEntries();
    return `${HEADER}
import type { SeedRuntime } from '@abuddy/sdk/testing';
${repositories.map(([name, path, exportName]) => `import { ${exportName} as __repo_${name} } from '${path}';`).join('\n')}
${hooks.map(([, path, exportName], i) => `import { ${exportName} as __seedHooks_${i} } from '${path}';`).join('\n')}

export const seedRuntime: SeedRuntime = {
  id: ${JSON.stringify(manifest.id)},
  entities: ${JSON.stringify(manifest.entities ?? {})},
  relKinds: ${JSON.stringify(manifest.relKinds ?? {})},
  repositories: { ${repositories.map(([name]) => `${name}: __repo_${name}`).join(', ')} },
  seedHooks: { ${hooks.map(([entity], i) => `${JSON.stringify(entity)}: __seedHooks_${i}`).join(', ')} },
};
`;
  }

  /** The facade types dependents import, bundled into dist/types/pack-types.d.ts by \`abuddy build\` */
  function generatePackTypes(): string {
    // `fe.ts` is generated only for a pack with plugins, and `PackPluginState` lives there: a pack with none has no
    // plugin state to publish, and naming the module anyway leaves the facade bundle unable to resolve it.
    const hasPlugins = (manifest.features ?? []).some(f => f.plugin);
    return `${HEADER}
export type { PackShapes as PackEntityShapes, PackStepNodes } from './ears.js';
export type { PackPluginEvents, PackSystemEvents } from './events.js';
${hasPlugins ? "export type { PackPluginState } from './fe.js';\n" : ''}export type { Services } from './services.js';
export type { Repositories } from './repository.js';
`;
  }

  function generateReferences(): string {
    const features = manifest.features ?? [];
    const referenceFeatures = features.filter(f => f.references);

    const imports = referenceFeatures.map((f, i) => {
      const importPath = toImportPath(root, f.references!);
      return `import { referenceTypes as types${i}, categories as categories${i}, itemsProvider as itemsProvider${i} } from '${importPath}';`;
    }).join('\n');

    const typesSpread = referenceFeatures.map((_, i) => `  ...types${i},`).join('\n');
    const categoriesSpread = referenceFeatures.map((_, i) => `  ...categories${i},`).join('\n');
    const providersEntries = referenceFeatures.map((_, i) => `  itemsProvider${i},`).join('\n');

    return `${HEADER}
import type { ReferenceTypeConfig, CategoryConfig, CategoryItemsProvider } from '@abuddy/sdk/fe/references';
${imports}

export const REFERENCE_TYPES: Record<string, ReferenceTypeConfig> = {
${typesSpread}
};

export const CATEGORIES: CategoryConfig[] = [
${categoriesSpread}
];

export const ITEMS_PROVIDERS: CategoryItemsProvider[] = [
${providersEntries}
];

export const PROTOCOL_TO_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(REFERENCE_TYPES).map(([type, cfg]) => [cfg.protocol, type])
);

export const ALL_PROTOCOLS: string[] = Object.values(REFERENCE_TYPES).map((cfg) => cfg.protocol);

export function categoryOfType(type: string): string {
  return REFERENCE_TYPES[type]?.category ?? '';
}

export type { ReferenceTypeConfig, CategoryConfig, CategoryItemsProvider } from '@abuddy/sdk/fe/references';
`;
  }

  function generateSeeders(): string {
    const entityNames = new Set(packRegistry().entities.keys());
    const seedImports = new Set<string>();
    const packImports: string[] = [];
    const registrations: string[] = [];

    // This pack's own formats are checked whether or not an entry uses them: dependents may
    for (const [name, format] of Object.entries(manifest.seedFormats ?? {})) {
      for (const entity of formatEntities(format)) {
        if (!entityNames.has(entity)) {
          throw new Error(`Seed format "${name}": entity "${entity}" isn't declared by this pack, its dependencies or the SDK`);
        }
      }
    }

    /** A pack module's `seed`, registered under the entry key */
    const packSeeder = (key: string, seeder: string) => {
      const importName = `__seeder_${toIdentifier(key)}`;
      packImports.push(`import { seed as ${importName} } from '${toImportPath(root, seeder)}';`);
      registrations.push(`{ key: ${JSON.stringify(key)}, seed: ${importName} }`);
    };

    for (const [key, seed] of Object.entries(resolvedSeeds())) {
      if (seed.kind === 'seeder') {
        packSeeder(key, seed.seeder);
        continue;
      }

      if (seed.kind === 'specialty') {
        const specialty = SPECIALTY_SEEDERS[key];
        seedImports.add(specialty.factory);
        registrations.push(`${specialty.factory}(${specialty.args})`);
        continue;
      }

      const { format } = seed;
      for (const entity of formatEntities(format)) {
        if (!entityNames.has(entity)) {
          throw new Error(`Seed "${key}": format "${seed.formatRef}" seeds entity "${entity}", which isn't declared by this pack, its dependencies or the SDK`);
        }
      }
      if (seed.seeder) {
        packSeeder(key, seed.seeder);
        continue;
      }
      // A compile-only format (no entity): pack code reads its seed file
      if (formatEntities(format).length === 0) continue;

      seedImports.add('createSeeder');
      const options = {
        key,
        entities: formatEntities(format),
        ...(format.identity && { identity: format.identity }),
        ...(format.tree?.relKind && { relKind: format.tree.relKind }),
        ...(format.media && { media: true }),
      };
      registrations.push(`createSeeder(${JSON.stringify(options)})`);
    }

    if (registrations.length === 0) {
      return `${HEADER}\nimport type { Seeder } from '@abuddy/sdk/utils';\n\n${COMPILED_DIR_ACCESSORS}\n/** The pack's seeders, which its registration carries */\nexport const seeders: Seeder[] = [];\n`;
    }

    return `${HEADER}
${seedImports.size > 0 ? `import { ${Array.from(seedImports).join(', ')} } from '@abuddy/sdk/seed';` : ''}
import { seedData, type Seeder, type SeedCounts, type SeedIncludeSet } from '@abuddy/sdk/utils';
${packImports.join('\n')}

${COMPILED_DIR_ACCESSORS}
/** The pack's seeders, one per seeded key, which its registration carries */
export const seeders: Seeder[] = [
${registrations.map((registration) => `  ${registration},`).join('\n')}
];

export { seedData };
export type { SeedCounts, SeedIncludeSet };
export type { ImportMode } from '@abuddy/sdk/utils';
`;
  }

  /** `boot.seed` resolved against this pack's formats and its dependencies' (compiler modules aren't loaded here) */
  function resolvedSeeds(): Record<string, ResolvedSeed> {
    const dependencies = new Map([...depSnapshots].map(([id, snap]) => [id, { manifest: snap.manifest }]));
    return resolveSeeds(manifest, root, dependencies);
  }

  /** The seed keys the host seeds into the database: entries with a seeder */
  function seededKeys(): string[] {
    return Object.entries(resolvedSeeds())
      .filter(([, seed]) => seed.kind !== 'format' || seed.seeder !== undefined || formatEntities(seed.format).length > 0)
      .map(([key]) => key);
  }

  /** [entity, source module specifier, export name] of each seed hook the manifest declares */
  function seedHookEntries(): [string, string, string][] {
    return Object.entries(manifest.seedHooks ?? {}).map(([entity, target]) => {
      const { source, exportName } = valueExport(`Seed hooks for "${entity}"`, target);
      return [entity, toImportPath(root, source), exportName] as [string, string, string];
    });
  }

  /** Imports and map entries for this pack's own entity shapes. Dependencies' come from their facade types. */
  function entityShapeEntries(): { imports: string[]; entries: string[] } {
    const imports: string[] = [];
    const entries: string[] = [];
    for (const [entity, { source, type: typeName }] of Object.entries(manifest.entityShapes ?? {})) {
      if ((SDK_SHAPED_ENTITIES as readonly string[]).includes(entity)) {
        throw new Error(`Entity shape "${entity}": the SDK declares this entity's shape; remove it from entityShapes`);
      }
      const normalized = source.split('\\').join('/');
      const file = sourceFileOf(normalized);
      if (!file || !exportOf(file, typeName)?.type) {
        throw new Error(`Entity shape "${entity}": ${source} doesn't export a type named "${typeName}"`);
      }
      const alias = `__shape_${entity.replace(/[^A-Za-z0-9_$]/g, '_')}`;
      imports.push(`import type { ${typeName} as ${alias} } from '${toImportPath(root, normalized)}';`);
      entries.push(`  '${entity}': ${alias};`);
    }
    return { imports, entries };
  }

  // ── Flow helpers ───────────────────────────────────────────────

  /** A step type or track field as a helper name: `-` and `_` separate words (`keep_alive`, `keep-alive` → `keepAlive`) */
  function toCamelCase(s: string): string {
    return s.replace(/[-_]+([A-Za-z0-9])/g, (_, c: string) => c.toUpperCase());
  }

  /** A step's helper: its name and code, or a re-export of its custom helpers module */
  function emitStepHelper(step: StepEntry): { name?: string; imports: string[]; helper?: string; reExport?: string } | null {
    if (!step.dsl) return null;
    const dsl = step.dsl;
    const name = toCamelCase(step.type);

    if (dsl.custom) {
      return { imports: [], reExport: `export * from '${toImportPath(root, step.path + '/helpers')}';` };
    }

    if (dsl.primaryField) {
      const typesFile = join(root, step.path, 'types.ts');
      const content = existsSync(typesFile) ? readFileSync(typesFile, 'utf-8') : '';
      const dslMatch = content.match(/export\s+interface\s+(DSL\w+Node)\b/);
      if (!dslMatch) {
        throw new Error(`Step "${step.type}": no DSL*Node interface found in ${step.path}/types.ts`);
      }
      const dslTypeName = dslMatch[1];
      return {
        name,
        imports: [`import type { ${dslTypeName} } from '${toImportPath(root, step.path + '/types')}';`],
        // Omit would drop the node's fields: DSLNodeBase's index signature makes keyof every string
        helper: `export function ${name}(${dsl.primaryField}: string, opts?: { [K in keyof ${dslTypeName} as K extends 'type' | '${dsl.primaryField}' ? never : K]: ${dslTypeName}[K] }): DSLStepNode {\n  return { type: '${step.type}', ${dsl.primaryField}, ...opts };\n}`,
      };
    }

    if (dsl.defaultLabel) {
      return {
        name,
        imports: [],
        helper: `export function ${name}(label: string = '${dsl.defaultLabel}'): DSLStepNode {\n  return { type: '${step.type}', label };\n}`,
      };
    }

    return {
      name,
      imports: [],
      helper: `export function ${name}(label?: string): DSLStepNode {\n  return { type: '${step.type}', ...(label && { label }) };\n}`,
    };
  }

  function emitTriggerTrackBuilder(step: StepEntry): { name: string; helper: string } | null {
    if (step.kind !== 'trigger') return null;
    // trackField lives with the build facets (build.ts); older layouts define it in index.ts,
    // possibly next to a helper build.ts, so check each file until one defines it
    const match = ['build.ts', 'index.ts']
      .map(f => join(root, step.path, f))
      .filter(f => existsSync(f))
      .map(f => readFileSync(f, 'utf-8').match(/trackField:\s*['"](\w+)['"]/))
      .find(Boolean);
    if (!match) return null;
    const trackField = match[1];
    if (trackField === 'event') return null;
    const name = toCamelCase(trackField);
    return {
      name,
      helper: `export function ${name}(${trackField}: string, exits: DSLStepNode[][], label?: string): Track {\n  return { ${trackField}, label: label ?? \`${toPascalCase(trackField)} (\${${trackField}})\`, exits };\n}`,
    };
  }

  /**
   * This pack's flow helpers: one per step it defines (custom steps re-export their helpers module),
   * its trigger track builders, and its dependencies' flow helpers, re-exported from the modules
   * their snapshots carry (the helpers and option types each dependency generated for itself). A
   * name this pack or an earlier dependency exports isn't re-exported again.
   */
  function generateFlowHelpers(): string {
    const imports: string[] = [];
    const helpers: string[] = [];
    const customReExports: string[] = [];
    const names = new Set(['entry', 'on']);
    const seenTypes = new Set<string>();

    for (const step of stepDefinitions) {
      if (seenTypes.has(step.type)) continue;
      seenTypes.add(step.type);

      const result = emitStepHelper(step);
      if (result) {
        imports.push(...result.imports);
        if (result.name) names.add(result.name);
        if (result.helper) helpers.push(result.helper);
        if (result.reExport) customReExports.push(result.reExport);
      }

      const track = emitTriggerTrackBuilder(step);
      if (track) {
        names.add(track.name);
        helpers.push(track.helper);
      }
    }

    const depReExports: string[] = [];
    for (const [depId, snap] of depSnapshots) {
      if (!snap.flowHelpers) continue;
      const reExported = snap.flowHelpers.exports.filter(name => !names.has(name));
      for (const name of reExported) names.add(name);
      if (reExported.length > 0) {
        depReExports.push(`// ${depId}\nexport { ${reExported.join(', ')} } from './deps/${depId}${FLOW_HELPERS_SUFFIX}.js';`);
      }
    }

    const sections = [
      ["import type { DSLStepNode, Track } from '@abuddy/sdk/build';", "export { entry, on } from '@abuddy/sdk/build';", ...imports].join('\n'),
      ...helpers,
      customReExports.join('\n'),
      ...depReExports,
    ].filter(Boolean);
    return `${HEADER}\n${sections.join('\n\n')}\n`;
  }

  function generateStepTypes(): string {
    if (!stepDefinitions.length) return '';
    const reExports = stepDefinitions
      .filter(step => existsSync(join(root, step.path, 'types.ts')))
      .map(step => `export type * from '${toImportPath(root, step.path + '/types')}';`);
    if (!reExports.length) return '';
    return `${HEADER}\n${reExports.join('\n')}\n`;
  }

  // ── DSL defs ───────────────────────────────────────────────────

  /** The `dsl` entries the host's code editors get: a `monaco` target with globals */
  function monacoDslEntries() {
    return Object.entries(manifest.dsl ?? {}).filter(([, def]) => def.targets.includes('monaco') && def.globals);
  }

  function generateDslTypesFe(): string {
    const monacoEntries = monacoDslEntries();
    if (monacoEntries.length === 0) return '';

    const imports = monacoEntries.map(([name]) =>
      `import ${name}Schema from '../../dist/defs/monaco/${name}-defs.d.ts?raw';`
    );

    const entries = monacoEntries.map(([name, def]) => {
      const globalsObj = Object.entries(def.globals!)
        .map(([k, v]) => `      ${k}: '${v}',`)
        .join('\n');
      return `  ${name}: {\n    prefix: '${def.prefix}',\n    schema: ${name}Schema,\n    globals: {\n${globalsObj}\n    },\n  },`;
    });

    return `${HEADER}
import type { DslTypeConfig } from '@abuddy/sdk/fe';
${imports.join('\n')}

/** The pack's DSL types for the host's code editors, which its frontend registration carries */
export const dslTypes: Record<string, DslTypeConfig> = {
${entries.join('\n')}
};
`;
  }

  // ── Assemble ────────────────────────────────────────────────────

  const files: [string, string][] = ([
    ['src/__generated__/pack-entry.ts', generateBackendEntry()],
    ['src/__generated__/pack-entry-fe.ts', generateFrontendEntry()],
    ['src/__generated__/ears.ts', generateEars()],
    ['src/__generated__/ref.ts', generateRef()],
    ['src/__generated__/fe.ts', generateFe()],
    ['src/__generated__/system-specs.ts', generateSystemSpecs()],
    ['src/__generated__/events.ts', generateEvents()],
    ['src/__generated__/types.ts', generateTypes()],
    ['src/__generated__/services.ts', generateServices()],
    ['src/__generated__/repository.ts', generateRepository()],
    ['src/__generated__/repositories.ts', generateRepositories()],
    ['src/__generated__/pack-types.ts', generatePackTypes()],
    // Each dependency's facade types, from its snapshot
    ...depIds.map((depId) => {
      const snap = depSnapshots.get(depId)!;
      return [_depTypesFile(depId), `${HEADER}${depTypesHeader(depId, snap.manifest.version)}\n${snap.defs[PACK_TYPES_DEF]}`];
    }),
    // Each dependency's flow helpers module and its declarations, from its snapshot
    ...[...depSnapshots].flatMap(([depId, snap]) => snap.flowHelpers
      ? [
        [depFlowHelpersFile(depId, '.js'), `${HEADER}\n${snap.flowHelpers.module}`],
        [depFlowHelpersFile(depId, '.d.ts'), `${HEADER}\n${snap.flowHelpers.types}`],
      ]
      : []),
    ['src/__generated__/references.ts', generateReferences()],
    ['src/__generated__/seeders.ts', generateSeeders()],
    ['src/__generated__/seed-runtime.ts', generateSeedRuntime()],
    ['src/__generated__/flow-helpers.ts', generateFlowHelpers()],
    ['src/__generated__/step-types.ts', generateStepTypes()],
    ['src/__generated__/dsl-types-fe.ts', generateDslTypesFe()],
  ] as [string, string][]).filter(([, content]) => content);

  return Object.fromEntries(files);
}
