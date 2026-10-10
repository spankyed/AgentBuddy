import { readFileSync, existsSync, statSync } from 'fs';
import { HOST_PLUGIN_EVENT_TYPES, HOST_SYSTEM_EVENT_TYPES } from '../events/index.ts';
import { dirname, extname, join } from 'path';
import { _mergeProvenance, packFeatures, PROVENANCE_KINDS, type PackManifest, type PackFeature, type PackProvenance, type PackTypeManifest, type PackSnapshot, type ProvenanceKind, type StepEntry } from './manifest.ts';
import { SDK_ENTITIES, SDK_REL_KINDS, SDK_SHAPED_ENTITIES } from '../types/sdk-entities.ts';
import { _reservedEntries } from '../types/reserved-names.ts';
import { formatEntities } from './content/items.ts';
import { resolveContentSources, type ResolvedContentSource } from './content/resolve.ts';
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

/**
 * The SDK appliers of the specialty content keys, each as the factory to call and the options it is given
 * besides the entry's own `onUserEdit` — which the caller merges in, since it is the manifest's to say and
 * not this table's.
 */
const SPECIALTY_APPLIERS: Record<string, { factory: string; options: Record<string, unknown> }> = {
  actions: { factory: 'createFormatApplier', options: { key: 'actions', entities: ['Action'], identity: ['label'] } },
  prompts: { factory: 'createFormatApplier', options: { key: 'prompts', entities: ['Prompt'], identity: ['label'] } },
  flows: { factory: 'createFlowApplier', options: {} },
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

/**
 * The module codegen writes the build-time step facets into, which `abuddy build` bundles to
 * `dist/build/steps.build.mjs` — what a dependent pack's build validates its flows with.
 */
export const STEPS_BUILD_MODULE = 'src/__generated__/steps-build.ts';

/** One step as codegen reads it: its manifest entry, its type (the map's key) and the directory its modules sit in */
interface StepDeclaration {
  type: string;
  kind?: 'step' | 'trigger';
  dsl?: StepEntry['dsl'];
  entry: StepEntry;
  path: string;
}

/** Extensions of the TypeScript sources codegen reads exports from */
const TS_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

/**
 * Specifier from src/__generated__ to a manifest path (relative to the pack root), naming the file that is
 * there.
 *
 * Explicit, because no runtime resolves an extensionless specifier in ESM — and the extension the module
 * *has*, rather than the `.js` this used to write for a `.ts` file. A pack is bundled rather than emitted as
 * individual modules, its tsconfig sets `allowImportingTsExtensions`, and every tool in its toolchain
 * resolves `.ts`: `tsc` and `vue-tsc` under `bundler` resolution, Vite, and esbuild. So `.js` bought nothing
 * here and cost the pack a second convention — its hand-written code names `.ts`, as the `@abuddy` packages'
 * own source does (`check:specifiers`, `findJsSpecifiers`).
 */
function toImportPath(root: string, manifestPath: string): string {
  const normalized = manifestPath.split('\\').join('/');
  const rel = '../' + normalized.replace(/^(\.\/)?src\//, '');
  if (MODULE_EXTENSIONS.has(extname(rel))) return rel;
  if (!existsSync(join(root, `${normalized}.ts`)) && existsSync(join(root, normalized, 'index.ts'))) {
    return `${rel}/index.ts`;
  }
  return `${rel}.ts`;
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
  function depTypeImports(name: string, from: readonly string[] = depIds): { imports: string[]; aliases: string[] } {
    return {
      imports: from.map((depId) => `import type { ${name} as ${depAlias(depId, name)} } from './deps/${depId}.ts';`),
      aliases: from.map((depId) => depAlias(depId, name)),
    };
  }

  /**
   * Whether a pack publishes `PackPluginState` — it has at least one feature with a plugin. Three outputs turn on
   * this one fact and must agree: whether `fe.ts` is emitted, whether `pack-types.ts` re-exports the type, and
   * whether a dependent imports it. Spelling it three ways is what left a dependent of a plugin-less pack with an
   * import nothing resolved.
   */
  const publishesPluginState = (forManifest: PackManifest, packId: string) => PROVENANCE_KINDS.plugins(forManifest, packId).length > 0;

  /** The dependencies whose facade publishes `PackPluginState`, by the same rule applied to their manifests */
  const depsWithPlugins = depIds.filter((depId) => publishesPluginState(depSnapshots.get(depId)!.manifest, depId));

  /**
   * The slash commands the pack declares. A name a dependency declares too fails the build: the app would
   * refuse to register the pack.
   */
  function declaredCommands(): NonNullable<NonNullable<PackManifest['extensions']>['commands']> {
    const commands = manifest.extensions?.commands ?? [];
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
      for (const feature of packFeatures(snap.manifest)) {
        for (const name of Object.keys(feature.repositories ?? {})) taken.set(name, depId);
      }
    }
    for (const feature of packFeatures(manifest)) {
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
      ...Object.keys(m.extensions?.services ?? {}),
      ...packFeatures(m).flatMap((f) => Object.keys(f.services ?? {})),
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
    const features = packFeatures(manifest);
    const targets = [
      ...features.flatMap((f) => [...Object.values(f.services ?? {}), ...Object.values(f.repositories ?? {})]),
      ...Object.values(manifest.extensions?.services ?? {}),
      ...Object.values(manifest.content?.writers ?? {}),
      ...Object.values(manifest.extensions?.blocks ?? {}).flatMap((b) => (b.be ? [b.be] : [])),
      ...Object.values(manifest.extensions?.steps ?? {}).flatMap((s) => [s.build, s.trigger?.facet, s.trigger?.register, s.runtime?.handler, s.fe].filter((t): t is string => t !== undefined)),
      ...(manifest.settingsSections ? [manifest.settingsSections] : []),
      ...(manifest.help ? [manifest.help] : []),
    ].map((target) => target.split('#')[0]);
    const sources = [
      ...targets,
      ...Object.values(manifest.entityShapes ?? {}).map((shape) => shape.source),
      ...features.flatMap((f) => (f.settings ? [f.settings] : [])),
      // The contract leaves, and not the system and plugin entries beside them: a feature's events are read from
      // its contract now, so putting the machines in the program would parse and bind every one of them — and
      // their whole closure, XState and Vue included — for nothing. Their paths still reach the generated
      // imports; only membership of this program is what they don't need.
      // Measured once, from the other end: a contract written to derive its state from its machine builds fine and
      // emits identical events, and adds the machine's whole inferred type to dist/types/pack-types.d.ts. So the
      // cost is not only parse time — it reaches the facade. `findContractLeafImports` is what keeps it out.
      ...features.flatMap((f) => (f.plugin?.contract ? [f.plugin.contract.split('#')[0]!] : [])),
      ...features.flatMap((f) => (f.system?.contract ? [f.system.contract.split('#')[0]!] : [])),
    ];
    return [...new Set(sources.map(sourceFileOf).filter((file): file is string => file !== undefined))];
  }

  let moduleExports: ModuleExports | undefined;
  function exportOf(file: string, name: string): ExportInfo | undefined {
    moduleExports ??= createModuleExports(root, exportedFromFiles());
    return moduleExports.exportOf(file, name);
  }

  function outgoingEventTypesOf(file: string, name: string): string[] {
    moduleExports ??= createModuleExports(root, exportedFromFiles());
    return moduleExports.outgoingEventTypesOf(file, name);
  }

  function inboxEventTypesOf(file: string, name: string): string[] {
    moduleExports ??= createModuleExports(root, exportedFromFiles());
    return moduleExports.inboxEventTypesOf(file, name);
  }

  /** Where a contract lives: the module as the manifest spells it, the resolved file, and the type's name */
  type ContractTarget = { source: string; exportName: string; file: string };

  /**
   * A feature's contract, as `abuddy.json` names it at `features[].<kind>.contract` — the module and the type in
   * it. A feature that names none publishes nothing: a system with no plugin of its own sends nothing anyone
   * receives, and a plugin without one still receives its own system's events.
   *
   * The contract is a *type*, so the check is that the module declares one: a name that is only a value is the
   * mistake worth catching, since reading it would silently yield an empty inbox.
   */
  function contractTarget(feature: PackFeature, kind: 'system' | 'plugin'): ContractTarget | undefined {
    const declared = kind === 'system' ? feature.system?.contract : feature.plugin?.contract;
    if (!declared) return undefined;
    const label = `Feature "${feature.id}": ${kind}.contract`;
    const target = exportTarget(label, declared);
    const info = exportOf(target.file, target.exportName);
    if (!info) throw new Error(`${label}: ${target.source} doesn't export "${target.exportName}"`);
    if (!info.type) throw new Error(`${label}: ${target.source} exports "${target.exportName}" only as a value, not a type. A ${kind}'s contract is a declared type codegen reads without running anything`);
    return target;
  }

  /** The contract each of `features` declares for `kind`, by feature id; a feature that declares none is absent */
  function contractsOf(features: PackFeature[], kind: 'system' | 'plugin'): Map<string, ContractTarget> {
    return new Map(features.flatMap((feature) => {
      const target = contractTarget(feature, kind);
      return target ? [[feature.id, target] as const] : [];
    }));
  }

  /** The event types a contract declares, with the feature named on anything the reader throws */
  function contractEventTypes(feature: PackFeature, kind: 'system' | 'plugin', read: (file: string, name: string) => string[]): string[] {
    const contract = contractTarget(feature, kind);
    if (!contract) return [];
    try {
      return read(contract.file, contract.exportName);
    } catch (err) {
      (err as Error).message = `Feature "${feature.id}": ${(err as Error).message}`;
      throw err;
    }
  }

  /** The event types a feature's system sends, read from its contract */
  function sentEventTypes(feature: PackFeature): string[] {
    return contractEventTypes(feature, 'system', outgoingEventTypesOf);
  }

  /** The event types a plugin's contract declares that any other plugin or system may send it */
  function acceptedEventTypes(feature: PackFeature): string[] {
    return contractEventTypes(feature, 'plugin', inboxEventTypesOf);
  }

  /**
   * The event types one of this pack's plugins receives: what its own feature's system sends it, and every audience
   * of the inbox its contract declares. The bus checks each send against this (`getPluginEventValidationMap`).
   *
   * One flat list, deliberately: the audiences are a type-level split, and a passing check here means the event's
   * **shape** was accepted, not that this sender was allowed to send it. `Message.from` is a label the generated
   * sends stamp, not a claim the bus checks — `docs/goals/wont-do/goal-sender-enforced-audiences.md` says why.
   */
  /**
   * The blocks a manifest declares, for the backend registration: the type is the map's key and the kind is
   * plain data, so the literal is written out rather than imported from a barrel. Only the backend facet is
   * a reference, and it is the half a backend process can run.
   */
  function blockDefinitions(): { imports: string[]; literal: string } {
    const imports: string[] = [];
    const items = Object.entries(manifest.extensions?.blocks ?? {}).map(([type, entry], index) => {
      const parts = [`type: '${type}'`];
      if (entry.kind) parts.push(`kind: '${entry.kind}'`);
      if (entry.be) {
        const { source, exportName } = valueExport(`Block "${type}": be`, entry.be);
        const local = `__blockBE_${index}`;
        imports.push(`import { ${exportName} as ${local} } from '${toImportPath(root, source)}';`);
        parts.push(`be: ${local}`);
      }
      return `    { ${parts.join(', ')} },`;
    });
    return { imports, literal: items.length ? `[\n${items.join('\n')}\n  ]` : '' };
  }

  /**
   * The same blocks for the frontend registration, carrying the component each declares instead of the
   * backend facet. A component is taken by its default export, as a plugin's entry is, so the manifest
   * names a file rather than a `"path#export"` target.
   */
  function blockDefinitionsFE(): { imports: string[]; literal: string } {
    const imports: string[] = [];
    const items = Object.entries(manifest.extensions?.blocks ?? {}).map(([type, entry], index) => {
      const parts = [`type: '${type}'`];
      if (entry.kind) parts.push(`kind: '${entry.kind}'`);
      if (entry.fe) {
        const local = `__blockFE_${index}`;
        imports.push(`import ${local} from '${toImportPath(root, componentFile(`Block "${type}": fe`, entry.fe))}';`);
        parts.push(`fe: { component: ${local} }`);
      }
      return `    { ${parts.join(', ')} },`;
    });
    return { imports, literal: items.length ? `[\n${items.join('\n')}\n  ]` : '' };
  }

  /**
   * A step's facets, each as an import and a member of the literal codegen writes. Three callers want
   * three subsets — the backend registration (build or trigger, plus runtime), the generated build module
   * a dependent pack loads (build or trigger alone) and the frontend registration (fe) — so each facet is
   * emitted once here and picked there.
   *
   * `handler` and `register` are wrapped in a lazy import rather than imported: a step's runtime module is
   * what reaches models, the filesystem and the terminal, and it is loaded on the step's first run. The
   * flags beside it are data, because the brain reads them before deciding how to run the step.
   */
  function stepFacet(label: string, target: string, local: string): { import: string; expr: string } {
    const { source, exportName } = valueExport(label, target);
    return { import: `import { ${exportName} as ${local} } from '${toImportPath(root, source)}';`, expr: local };
  }

  /** A function reached through `await import(...)`, so its module loads when the step first needs it */
  function lazyCall(label: string, target: string, args: string): string {
    const { source, exportName } = valueExport(label, target);
    return `async (${args}) => (await import('${toImportPath(root, source)}')).${exportName}(${args})`;
  }

  /** The steps a manifest declares, for the backend registration: the build-time facet and the runtime */
  function stepDefinitionsBE(): { imports: string[]; literal: string } {
    const imports: string[] = [];
    const items = stepDefinitions.map((step, index) => {
      const parts = [`type: '${step.type}'`];
      if (step.kind) parts.push(`kind: '${step.kind}'`);
      if (step.entry.build) {
        const facet = stepFacet(`Step "${step.type}": build`, step.entry.build, `__stepBuild_${index}`);
        imports.push(facet.import);
        parts.push(`build: ${facet.expr}`);
      }
      if (step.entry.trigger) {
        const facet = stepFacet(`Step "${step.type}": trigger.facet`, step.entry.trigger.facet, `__stepTrigger_${index}`);
        imports.push(facet.import);
        const register = step.entry.trigger.register
          ? `, register: ${lazyCall(`Step "${step.type}": trigger.register`, step.entry.trigger.register, 'node, ctx')}`
          : '';
        parts.push(register ? `trigger: { ...${facet.expr}${register} }` : `trigger: ${facet.expr}`);
      }
      const runtime = stepRuntimeLiteral(step, index);
      if (runtime) {
        imports.push(...runtime.imports);
        parts.push(`runtime: ${runtime.literal}`);
      }
      return `    { ${parts.join(', ')} },`;
    });
    return { imports, literal: items.length ? `[\n${items.join('\n')}\n  ]` : '' };
  }

  /** A step's runtime facet: its flags, and its handler — behind a lazy import unless it declares `sync` */
  function stepRuntimeLiteral(step: StepDeclaration, index: number): { imports: string[]; literal: string } | undefined {
    const runtime = step.entry.runtime;
    if (!runtime) return undefined;
    const imports: string[] = [];
    const parts: string[] = [];
    if (runtime.handler) {
      const label = `Step "${step.type}": runtime.handler`;
      if (runtime.sync) {
        // The one case the module is imported with the entry: the handler's sends have to land in the
        // brain's own dispatch, and `await import(...)` puts them a tick too late
        const facet = stepFacet(label, runtime.handler, `__stepHandler_${index}`);
        imports.push(facet.import);
        parts.push(`handler: ${facet.expr}`);
      } else {
        parts.push(`handler: ${lazyCall(label, runtime.handler, 'tNode, node, ctx, actor')}`);
      }
    }
    for (const flag of ['isAsync', 'waits', 'spawnsSubflow'] as const) {
      if (runtime[flag]) parts.push(`${flag}: true`);
    }
    return parts.length ? { imports, literal: `{ ${parts.join(', ')} }` } : undefined;
  }

  /**
   * The module a dependent pack's `abuddy build` loads to validate its flows: the build-time facets alone,
   * with no runtime handler and nothing frontend. It is generated from the same manifest entries the
   * backend registration is, so the two cannot name different facets — which is what the hand-written
   * second barrel could do and what `build-barrel.spec.ts` existed to catch.
   */
  function generateStepsBuild(): string {
    if (stepDefinitions.length === 0) return '';
    const imports: string[] = [];
    const items = stepDefinitions.map((step, index) => {
      const parts = [`type: '${step.type}'`];
      if (step.kind) parts.push(`kind: '${step.kind}'`);
      if (step.entry.build) {
        const facet = stepFacet(`Step "${step.type}": build`, step.entry.build, `__stepBuild_${index}`);
        imports.push(facet.import);
        parts.push(`build: ${facet.expr}`);
      }
      if (step.entry.trigger) {
        const facet = stepFacet(`Step "${step.type}": trigger.facet`, step.entry.trigger.facet, `__stepTrigger_${index}`);
        imports.push(facet.import);
        parts.push(`trigger: ${facet.expr}`);
      }
      return `  { ${parts.join(', ')} },`;
    });
    return `${HEADER}
import type { StepDefinition } from '@abuddy/sdk/steps';
${imports.join('\n')}

export const steps: StepDefinition[] = [
${items.join('\n')}
];
`;
  }

  /** The steps a manifest declares, for the frontend registration: what the flow editor draws */
  function stepDefinitionsFE(): { imports: string[]; literal: string } {
    const imports: string[] = [];
    const items = stepDefinitions.filter((step) => step.entry.fe).map((step, index) => {
      const facet = stepFacet(`Step "${step.type}": fe`, step.entry.fe!, `__stepFE_${index}`);
      imports.push(facet.import);
      const parts = [`type: '${step.type}'`];
      if (step.kind) parts.push(`kind: '${step.kind}'`);
      parts.push(`fe: ${facet.expr}`);
      return `    { ${parts.join(', ')} },`;
    });
    return { imports, literal: items.length ? `[\n${items.join('\n')}\n  ]` : '' };
  }

  /**
   * The artifact types a manifest declares, for the backend registration: the type alone, since both facets
   * an artifact has are frontend ones. This is what keeps `lucide-vue-next` out of the pack's backend
   * bundle, where a barrel of `fe: { icon }` literals put the whole icon set.
   */
  function artifactDefinitions(): string {
    const items = Object.keys(manifest.extensions?.artifacts ?? {}).map((type) => `    { type: '${type}' },`);
    return items.length ? `[\n${items.join('\n')}\n  ]` : '';
  }

  /**
   * The same artifacts for the frontend registration, each with the icon it names and the viewer it
   * declares. The icons are one import from `lucide-vue-next`, which the host provides the frontend.
   */
  function artifactDefinitionsFE(): { imports: string[]; literal: string } {
    const entries = Object.entries(manifest.extensions?.artifacts ?? {});
    if (entries.length === 0) return { imports: [], literal: '' };
    const icons = [...new Set(entries.map(([, entry]) => entry.icon))].sort();
    const imports = [`import { ${icons.join(', ')} } from 'lucide-vue-next';`];
    const items = entries.map(([type, entry], index) => {
      const facet = [`icon: ${entry.icon}`];
      if (entry.fe) {
        const local = `__artifactFE_${index}`;
        imports.push(`import ${local} from '${toImportPath(root, componentFile(`Artifact "${type}": fe`, entry.fe))}';`);
        facet.push(`component: ${local}`);
      }
      return `    { type: '${type}', fe: { ${facet.join(', ')} } },`;
    });
    return { imports, literal: `[\n${items.join('\n')}\n  ]` };
  }

  /** A manifest path naming a component file, taken by its default export */
  function componentFile(label: string, manifestPath: string): string {
    const normalized = manifestPath.split('\\').join('/');
    const file = join(root, normalized);
    if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`${label}: no file at ${normalized}`);
    return normalized;
  }

  function receivedEventTypes(feature: PackFeature): string[] {
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
  function settingsSource(feature: PackFeature): string {
    const label = `Feature "${feature.id}"`;
    const file = sourceFileOf(feature.settings!);
    if (!file) throw new Error(`${label}: no settings file found at ${feature.settings} (.ts or /index.ts)`);
    if (!exportOf(file, 'default')?.value) throw new Error(`${label}: settings ${feature.settings} has no default export of the settings object`);
    return feature.settings!;
  }

  function typesEntry(feature: PackFeature): string {
    return feature.typesEntry ?? `src/features/${feature.id}/be/types`;
  }

  /**
   * The steps this pack declares, each with the directory its modules sit in: the dirname of the first
   * facet it names. A step's `types.ts` and `helpers.ts` are read from there, because they sit beside the
   * facets rather than being declared — the step's directory is one fact and the manifest states it once,
   * as the path to a facet.
   */
  const stepDefinitions: StepDeclaration[] = Object.entries(manifest.extensions?.steps ?? {}).map(([type, entry]) => ({
    type,
    kind: entry.kind,
    dsl: entry.dsl,
    entry,
    path: stepDir(entry),
  }));

  function stepDir(entry: StepEntry): string {
    const first = entry.build ?? entry.trigger?.facet ?? entry.runtime?.handler ?? entry.fe;
    return first ? dirname(first.split('#')[0]!) : '';
  }

  // ── Backend entry ──────────────────────────────────────────────

  function generateBackendEntry(): string {
    const features = packFeatures(manifest);
    const systemFeatures = features.filter(f => f.system);
    // Every system's events are read, a system without a plugin's too: an entry that lost them (annotated
    // `: SystemEntry`) would give the facade types nothing but `{ type: string }`
    for (const feature of systemFeatures) sentEventTypes(feature);

    const systemImports = systemFeatures
      .map(f => `import ${systemBinding(f.id)} from '${toImportPath(root, f.system!.entry)}';`)
      .join('\n');

    // `incoming` — the extra event types a manifest declares its system accepts — is the only option
    // `packSystem` takes, so there is nothing here to combine
    const systemExpr = (f: PackFeature): string => {
      const incoming = f.system!.events?.incoming;
      const options = incoming?.length ? `, { incoming: ${JSON.stringify(incoming)} }` : '';
      return `packSystem(${systemBinding(f.id)}${options})`;
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

    const writerEntries = contentWriterEntries();
    const blocks = blockDefinitions();
    const artifacts = artifactDefinitions();
    const steps = stepDefinitionsBE();
    // The pack's settings sections: a function returning them, called the first time the defaults are read
    const sections = manifest.settingsSections
      ? valueExport('settingsSections', manifest.settingsSections)
      : undefined;
    // The pack's help entries, called the first time the Settings view's Help list is read
    const help = manifest.help ? valueExport('help', manifest.help) : undefined;

    // The machine each system was built from is typed by the contract the manifest names for its feature, and
    // nothing in either file says so: this asserts it where both are in scope.
    const contracted = systemFeatures.filter(f => contractTarget(f, 'system'));
    const contractCheck = contracted.length === 0 ? '' : `
// Each system's machine is typed by the contract abuddy.json names for its feature — the one its facade publishes.
// A machine built from some other contract compiles on its own, so a mismatch reads here as the sentence
// \`MachineMatchesContract\` returns, in place of the \`true\` the constraint asks for. Type-only: it leaves
// nothing behind in the pack's bundle. Exported because a local type nobody reads is what noUnusedLocals
// reports, and the assertion is the same either way.
type __ContractMatches<T extends true> = T;
export type __ContractChecks = {
${contracted.map(f => `  '${f.id}': __ContractMatches<MachineMatchesContract<typeof ${systemBinding(f.id)}, __SystemContracts['${f.id}']>>;`).join('\n')}
};
`;

    return `${HEADER}
import type { PackRegistration } from '@abuddy/sdk/framework';
${contracted.length ? "import type { MachineMatchesContract } from '@abuddy/sdk/framework';\nimport type { SystemContracts as __SystemContracts } from './system-specs.ts';\n" : ''}${systemFeatures.length ? "import { packSystem } from '@abuddy/sdk/framework';\n" : ''}${hasRepositories() ? "import { repositories } from './repositories.ts';\n" : ''}
${systemImports}
import { featureServices } from './services.ts';
${hooksImport}
${writerEntries.map(([, path, exportName], i) => `import { ${exportName} as __contentWriter_${i} } from '${path}';`).join('\n')}
${settingsImports}
${manifest.migrations ? `import { migrations } from '${toImportPath(root, manifest.migrations)}';` : ''}
${steps.imports.join('\n')}
${blocks.imports.join('\n')}
import { appliers } from './appliers.ts';
export { setCompiledDir } from './appliers.ts';
${sections ? `import { ${sections.exportName} as __settingsSections } from '${toImportPath(root, sections.source)}';` : ''}
${help ? `import { ${help.exportName} as __help } from '${toImportPath(root, help.source)}';` : ''}

export const registration: PackRegistration = {
  id: '${manifest.id}',
  features: {${featuresLiteral ? `\n${featuresLiteral},\n  ` : ''}},
  services: featureServices,
${hasRepositories() ? '  repositories,' : ''}
${steps.literal ? `  steps: ${steps.literal},` : ''}
${artifacts ? `  artifacts: ${artifacts},` : ''}
${blocks.literal ? `  blocks: ${blocks.literal},` : ''}
${writerEntries.length > 0 ? `  contentWriters: { ${writerEntries.map(([entity], i) => `${JSON.stringify(entity)}: __contentWriter_${i}`).join(', ')} },` : ''}
  appliers,
${commands.length ? `  commands: ${JSON.stringify(commands)},` : ''}
${sections ? '  settingsSections: __settingsSections,' : ''}
${help ? '  help: __help,' : ''}
  ears: {
    // Only this pack's own: EARS also names its dependencies' and the SDK's, which they register
    entities: ${JSON.stringify(manifest.entities ?? {})},
    relKinds: ${JSON.stringify(manifest.relKinds ?? {})},
  },
${manifest.boot?.hooks ? '  boot: { ..._hooks },\n' : ''}${manifest.migrations ? '  migrations,' : ''}
};
${contractCheck}`;
  }

  // ── Frontend entry ─────────────────────────────────────────────

  function generateFrontendEntry(): string {
    const features = packFeatures(manifest);
    const pluginFeatures = features.filter(f => f.plugin);

    // The plugin module is passed through as the author wrote it, keyed by its feature as the backend entry is: the
    // host registers it at the feature's ref, with the feature's role
    const pluginImports = pluginFeatures
      .map(f => `import ${pluginBinding(f.id)} from '${toImportPath(root, f.plugin!.entry)}';`)
      .join('\n');
    // The feature whose plugin claims it, and no fallback: `features` is a map, so "the pack's first" would
    // be whatever key order JSON tooling left behind. A pack claiming none has no default plugin, which the
    // shell handles (`defaultPlugin: null`, `wantsDefaultPlugin`)
    const defaultFeature = pluginFeatures.find(f => f.plugin?.default);
    // A designated feature with no plugin is listed for its role, so a frontend send to that role resolves
    const featureEntries = features.filter((f) => f.plugin || f.designation).map((f) => {
      const parts = f.plugin ? [`plugin: ${pluginBinding(f.id)}`] : [];
      if (f.designation) parts.push(`designation: '${f.designation}'`);
      if (f === defaultFeature) parts.push('default: true');
      return `    '${f.id}': { ${parts.join(', ')} },\n`;
    }).join('');

    const fe = manifest.extensions?.fe ?? {};

    const blocks = blockDefinitionsFE();
    const artifacts = artifactDefinitionsFE();
    const steps = stepDefinitionsFE();

    const extraImports: string[] = [];
    if (fe.tiptapPlugins) {
      extraImports.push(`import { tiptapPlugins } from '${toImportPath(root, fe.tiptapPlugins)}';`);
    }
    extraImports.push(...steps.imports, ...artifacts.imports, ...blocks.imports);
    const appExt = Object.entries(fe.appExtensions ?? {});
    for (const [key, extPath] of appExt) {
      extraImports.push(`import __appExtension_${key} from '${toImportPath(root, extPath)}';`);
    }

    const regProps: string[] = [];
    if (steps.literal) regProps.push(`  steps: ${steps.literal},`);
    if (fe.tiptapPlugins) regProps.push(`  tiptapPlugins,`);
    if (appExt.length) {
      const extObj = appExt.map(([key]) => `${key}: __appExtension_${key}`).join(', ');
      regProps.push(`  appExtensions: { ${extObj} },`);
    }
    if (artifacts.literal) regProps.push(`  artifacts: ${artifacts.literal},`);
    if (blocks.literal) regProps.push(`  blocks: ${blocks.literal},`);

    if (monacoDslEntries().length > 0) {
      extraImports.push(`import { dslTypes } from './dsl-types-fe.ts';`);
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
${ownNodes ? "import type { NodeEntity } from './types.ts';\n" : ''}${shapeImports.join('\n')}

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
      ...packFeatures(manifest).map((f) => f.id),
      ...[...depSnapshots].flatMap(([depId, snap]) => packFeatures(snap.manifest).map((f) => `${depId}/${f.id}`)),
      ...Object.keys(_mergeProvenance('plugins', [...depSnapshots])),
      ...Object.keys(HOST_PLUGIN_EVENT_TYPES),
      ...Object.keys(HOST_SYSTEM_EVENT_TYPES),
    ])];
    return `${HEADER}
import { resolveName, type FeatureRef } from '@abuddy/sdk/ids';

/** A feature this pack's code can name: its own by feature id, its dependencies' and the host's as \`<packId>/<featureId>\` */
export type FeatureName = ${names.map((name) => `'${name}'`).join(' | ')};

/** This pack's id, as \`abuddy.json\` declares it: what its sends stamp as \`Message.from\` */
export const packId = '${manifest.id}';

/** The ref of a feature this pack's code names */
export const ref = (name: FeatureName): FeatureRef => resolveName(name, packId);
`;
  }

  // A pack's own data directory, with its id bound — the same shape as `ref` above and as the sends in
  // events.ts, so a pack never writes its own id and never reaches another pack's data.
  function generatePaths(): string {
    return `${HEADER}
import { _packDataDir } from '@abuddy/sdk/utils';

/**
 * A directory this pack keeps data in, under its own namespace (\`pack-data/${manifest.id}/<name>\`).
 *
 * \`name\` is one directory: letters, digits, dot, dash and underscore, up to 64 characters. A separator or a
 * traversal throws, because the name used to be joined straight onto the directory Chromium also writes to.
 */
export const getDataDirPath = (name: string): string => _packDataDir('${manifest.id}', name);
`;
  }

  // Frontend helpers that take the names this pack's code writes: its own plugins by feature id, those its
  // dependencies declare as `<packId>/<featureId>`. Kept apart from events.ts, which backend systems import,
  // because these reach the frontend SDK.
  function generateFe(): string {
    const features = packFeatures(manifest);
    const pluginFeatures = features.filter(f => f.plugin);
    if (!publishesPluginState(manifest, manifest.id)) return '';
    const own = pluginFeatures.map(f => f.id);
    const plugins = [...own, ...Object.keys(_mergeProvenance('plugins', [...depSnapshots])).sort()].map(name => `'${name}'`);

    // Each own plugin's published state, from the same contract the inbox is read from. A feature that declares no
    // contract publishes nothing, and `never` is what a selector for it gets.
    const contracts = contractsOf(pluginFeatures, 'plugin');
    const stateImports = [...contracts]
      .map(([id, contract]) => `import type { ${contract.exportName} as __state_contract_${id} } from '${toImportPath(root, contract.source)}';`)
      .join('\n');
    const ownState = pluginFeatures
      .map(f => `  '${f.id}': ${contracts.has(f.id) ? `PluginStateOf<__state_contract_${f.id}>` : 'never'};`)
      .join('\n');
    const depState = depTypeImports('PackPluginState', depsWithPlugins);
    const qualifiedState = depsWithPlugins.map((depId) => `Qualified<'${depId}', ${depAlias(depId, 'PackPluginState')}>`);

    return `${HEADER}
import { pluginIsRunning, readUntypedPluginState, untypedOpenPlugin, useUntypedPluginState, type PluginStateOf } from '@abuddy/sdk/fe';
${qualifiedState.length > 0 ? "import type { Qualified } from '@abuddy/sdk/events';\n" : ''}import type { Ref } from 'vue';
import type { SendablePluginEvents } from './events.ts';
import { ref } from './ref.ts';
${stateImports}
${depState.imports.join('\n')}

/**
 * A plugin as this pack's code names it: its own by feature id, a dependency's as \`<packId>/<featureId>\`.
 * A plugin named by data (a link's target, a registered plugin's \`id\`) opens through \`untypedOpenPlugin\`
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
export function openPlugin<Name extends PluginName>(
  name: Name,
  event?: SendablePluginEvents[Name] | SendablePluginEvents[Name][],
): void {
  untypedOpenPlugin(ref(name), event);
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
    const features = packFeatures(manifest);
    const systemFeatures = features.filter(f => f.system);
    const pluginFeatures = features.filter(f => f.plugin);
    const hasSystems = systemFeatures.length > 0;

    // Each system's sent events, read from its spec: the one place they are declared
    const outgoingAliases = systemFeatures
      .map(f => `type __events_${f.id} = OutgoingEventsOf<__SystemContracts['${f.id}']>;`)
      .join('\n');
    // Each plugin's declared contract, from the leaf module abuddy.json names — never the plugin module itself,
    // whose machine imports cycle back through this file
    const contracts = contractsOf(pluginFeatures, 'plugin');
    const acceptsImports = [...contracts]
      .map(([id, contract]) => `import type { ${contract.exportName} as __contract_${id} } from '${toImportPath(root, contract.source)}';`)
      .join('\n');
    const acceptsAliases = pluginFeatures
      .flatMap(f => contracts.has(f.id)
        ? [`type __accepts_${f.id} = PluginInboxOf<__contract_${f.id}>;`, `type __public_${f.id} = PublicPluginInboxOf<__contract_${f.id}>;`]
        : [`type __accepts_${f.id} = never;`, `type __public_${f.id} = never;`])
      .join('\n');
    // A plugin receives what its own feature's system sends it, and whatever it declares anyone else may send
    const entries = pluginFeatures.map((f) => {
      const ownSystem = systemFeatures.some(s => s.id === f.id) ? [`__events_${f.id}`] : [];
      return `  '${f.id}': ${[...ownSystem, `__accepts_${f.id}`].join(' | ')};`;
    }).join('\n');
    const systemEntries = systemFeatures.map(f => `  '${f.id}': IncomingEventsOf<__SystemContracts['${f.id}']>;`).join('\n');
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
import { defineEvents, type HostPluginEvents, type HostSystemEvents, type IncomingEventsOf${hasSystems ? ', type OutgoingEventsOf' : ''}${contracts.size > 0 ? ', type PluginInboxOf, type PublicPluginInboxOf' : ''}, type Qualified, type WithOwnNames } from '@abuddy/sdk/events';
${hasSystems ? `import type { SystemContracts as __SystemContracts } from './system-specs.ts';\n` : ''}${acceptsImports ? `${acceptsImports}\n` : ''}${[...depPlugins.imports, ...depSystems.imports].join('\n')}
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

export const { broadcastToPlugin, sendToWindow, sendToPlugin, sendToSystem } = /*#__PURE__*/ defineEvents<SendablePluginEvents, SendableSystemEvents>('${manifest.id}');
`;
  }

  /** The events each system receives and sends, from its spec; type-only, so facades carry no machines or contexts */
  function generateSystemSpecs(): string {
    const systemFeatures = packFeatures(manifest).filter(f => f.system);
    if (!systemFeatures.length) return '';
    const contracts = contractsOf(systemFeatures, 'system');
    const imports = [...contracts]
      .map(([id, contract]) => `import type { ${contract.exportName} as __system_contract_${id} } from '${toImportPath(root, contract.source)}';`)
      .join('\n');
    const entries = systemFeatures
      .map(f => `  '${f.id}': ${contracts.has(f.id) ? `__system_contract_${f.id}` : 'never'};`)
      .join('\n');
    return `${HEADER}
// Type-only: #generated/events reads each system's incoming and outgoing events from its feature's contract, by
// feature id. It imports the contracts and never the system modules — those import #generated/events themselves,
// so reading them here would put the machine in front of the file that describes it.
${imports}

export type SystemContracts = {
${entries}
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
    const features = packFeatures(manifest);

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
    const features = packFeatures(manifest);
    const packServices = manifest.extensions?.services ?? {};
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
import type { TypedSendToPlugin, TypedSendToWindow, TypedSendToSystem } from '@abuddy/sdk/events';
import type { Repositories } from './repository.ts';
import type { QualifiedPluginEvents, QualifiedSystemEvents } from './events.ts';
${imports.join('\n')}
${deps.imports.join('\n')}

export const featureServices = {
${entries.join('\n')}
};

/**
 * \`services.emitter\`, typed with this pack's events. A system and a plugin are both named
 * \`<pack>/<feature>\`, this pack's own and the host's too; a system may also be a role.
 *
 * Naming its own pack is the point, not a gap left by the action having no pack scope. An action is content,
 * not source: a row a user can edit in the Actions plugin, read in the DB console, export to a content file and
 * copy into another pack. A bare name would rebind on that copy — \`'threads'\` quietly meaning the new pack's
 * feature, or nothing — where a ref that no longer fits is wrong visibly, and is refused at the bus rather
 * than doing something else.
 */
export type PackEmitter = Omit<HostServices['emitter'], 'broadcastToPlugin' | 'sendToWindow' | 'sendToSystem'> & {
  broadcastToPlugin: TypedSendToPlugin<QualifiedPluginEvents>;
  sendToWindow: TypedSendToWindow<QualifiedPluginEvents>;
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
    return packFeatures(manifest).flatMap(f => Object.entries(f.repositories ?? {}).map(([name, target]) => {
      if (seen.has(name)) throw new Error(`Repository "${name}" is declared by features "${seen.get(name)}" and "${f.id}"`);
      seen.set(name, f.id);
      const { source, exportName } = valueExport(`Repository "${name}" (feature "${f.id}")`, target);
      return [name, toImportPath(root, source), exportName] as [string, string, string];
    }));
  }

  function hasRepositories(): boolean {
    return packFeatures(manifest).some(f => Object.keys(f.repositories ?? {}).length > 0);
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
   * The pack's content runtime (entity types, relation kinds, repositories, content writers), what applying its
   * entity types needs outside the app. \`abuddy build\` bundles it into dist/build/content-runtime.mjs for
   * dependents' unit tests; the pack's own tests import it from #generated/content-runtime.
   */
  function generateContentRuntime(): string {
    const repositories = repositoryEntries();
    const hooks = contentWriterEntries();
    return `${HEADER}
import type { ContentRuntime } from '@abuddy/sdk/testing';
${repositories.map(([name, path, exportName]) => `import { ${exportName} as __repo_${name} } from '${path}';`).join('\n')}
${hooks.map(([, path, exportName], i) => `import { ${exportName} as __contentWriter_${i} } from '${path}';`).join('\n')}

export const contentRuntime: ContentRuntime = {
  id: ${JSON.stringify(manifest.id)},
  entities: ${JSON.stringify(manifest.entities ?? {})},
  relKinds: ${JSON.stringify(manifest.relKinds ?? {})},
  repositories: { ${repositories.map(([name]) => `${name}: __repo_${name}`).join(', ')} },
  contentWriters: { ${hooks.map(([entity], i) => `${JSON.stringify(entity)}: __contentWriter_${i}`).join(', ')} },
};
`;
  }

  /** The facade types dependents import, bundled into dist/types/pack-types.d.ts by \`abuddy build\` */
  function generatePackTypes(): string {
    // `fe.ts` is generated only for a pack with plugins, and `PackPluginState` lives there: a pack with none has no
    // plugin state to publish, and naming the module anyway leaves the facade bundle unable to resolve it.
    const hasPlugins = publishesPluginState(manifest, manifest.id);
    return `${HEADER}
export type { PackShapes as PackEntityShapes, PackStepNodes } from './ears.ts';
export type { PackPluginEvents, PackSystemEvents } from './events.ts';
${hasPlugins ? "export type { PackPluginState } from './fe.ts';\n" : ''}export type { Services } from './services.ts';
export type { Repositories } from './repository.ts';
`;
  }

  function generateReferences(): string {
    const features = packFeatures(manifest);
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

export const ALL_PROTOCOLS: string[] = Object.values(REFERENCE_TYPES).map((cfg) => cfg.protocol);

export type { ReferenceTypeConfig, CategoryConfig, CategoryItemsProvider } from '@abuddy/sdk/fe/references';
`;
  }

  function generateAppliers(): string {
    const entityNames = new Set(packRegistry().entities.keys());
    const applierImports = new Set<string>();
    const packImports: string[] = [];
    const registrations: string[] = [];

    // This pack's own formats are checked whether or not a source uses them: dependents may
    for (const [name, format] of Object.entries(manifest.content?.formats ?? {})) {
      for (const entity of formatEntities(format)) {
        if (!entityNames.has(entity)) {
          throw new Error(`Content format "${name}": entity "${entity}" isn't declared by this pack, its dependencies or the SDK`);
        }
      }
    }

    /** A pack module's `apply`, registered under the content key */
    const packApplier = (key: string, applier: string) => {
      const importName = `__applier_${toIdentifier(key)}`;
      packImports.push(`import { apply as ${importName} } from '${toImportPath(root, applier)}';`);
      registrations.push(`{ key: ${JSON.stringify(key)}, apply: ${importName} }`);
    };

    for (const [key, source] of Object.entries(resolvedContentSources())) {
      if (source.kind === 'applier') {
        packApplier(key, source.applier);
        continue;
      }

      if (source.kind === 'specialty') {
        const specialty = SPECIALTY_APPLIERS[key]!;
        applierImports.add(specialty.factory);
        const options = { ...specialty.options, ...(source.onUserEdit && { onUserEdit: source.onUserEdit }) };
        // `createFlowApplier()` takes no options at all when the entry declares none, which is most packs
        registrations.push(`${specialty.factory}(${Object.keys(options).length > 0 ? JSON.stringify(options) : ''})`);
        continue;
      }

      const { format } = source;
      for (const entity of formatEntities(format)) {
        if (!entityNames.has(entity)) {
          throw new Error(`Content "${key}": format "${source.formatRef}" writes entity "${entity}", which isn't declared by this pack, its dependencies or the SDK`);
        }
      }
      if (source.applier) {
        packApplier(key, source.applier);
        continue;
      }

      applierImports.add('createFormatApplier');
      const options = {
        key,
        entities: formatEntities(format),
        ...(format.identity && { identity: format.identity }),
        ...(format.tree?.relKind && { relKind: format.tree.relKind }),
        ...(format.media && { media: true }),
        ...(source.onUserEdit && { onUserEdit: source.onUserEdit }),
      };
      registrations.push(`createFormatApplier(${JSON.stringify(options)})`);
    }

    if (registrations.length === 0) {
      return `${HEADER}\nimport type { ContentApplier } from '@abuddy/sdk/utils';\n\n${COMPILED_DIR_ACCESSORS}\n/** The pack's appliers, which its registration carries */\nexport const appliers: ContentApplier[] = [];\n`;
    }

    return `${HEADER}
${applierImports.size > 0 ? `import { ${Array.from(applierImports).join(', ')} } from '@abuddy/sdk/content';` : ''}
import { importCompiledContent, type ContentApplier, type ApplyResult, type ContentSelection } from '@abuddy/sdk/utils';
${packImports.join('\n')}

${COMPILED_DIR_ACCESSORS}
/** The pack's appliers, one per content key, which its registration carries */
export const appliers: ContentApplier[] = [
${registrations.map((registration) => `  ${registration},`).join('\n')}
];

export { importCompiledContent };
export type { ApplyResult, ContentSelection };
export type { ImportMode } from '@abuddy/sdk/utils';
`;
  }

  /** `content.sources` resolved against this pack's formats and its dependencies' (compiler modules aren't loaded here) */
  function resolvedContentSources(): Record<string, ResolvedContentSource> {
    const dependencies = new Map([...depSnapshots].map(([id, snap]) => [id, { manifest: snap.manifest }]));
    return resolveContentSources(manifest, root, dependencies);
  }

  /** [entity, source module specifier, export name] of each content writer the manifest declares */
  function contentWriterEntries(): [string, string, string][] {
    return Object.entries(manifest.content?.writers ?? {}).map(([entity, target]) => {
      const { source, exportName } = valueExport(`A content writer for "${entity}"`, target);
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
  function emitStepHelper(step: StepDeclaration): { name?: string; imports: string[]; helper?: string; reExport?: string } | null {
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

  function emitTriggerTrackBuilder(step: StepDeclaration): { name: string; helper: string } | null {
    if (step.kind !== 'trigger') return null;
    // `trackField` is a member of the TriggerFacet, so it is read from the module the manifest names for it
    // rather than guessed at by filename
    const facet = step.entry.trigger?.facet;
    const file = facet && sourceFileOf(facet.split('#')[0]!);
    const match = file ? readFileSync(file, 'utf-8').match(/trackField:\s*['"](\w+)['"]/) : null;
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
    return Object.entries(manifest.extensions?.dsl ?? {}).filter(([, def]) => def.targets.includes('monaco') && def.globals);
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
    ['src/__generated__/paths.ts', generatePaths()],
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
    ['src/__generated__/appliers.ts', generateAppliers()],
    ['src/__generated__/content-runtime.ts', generateContentRuntime()],
    ['src/__generated__/flow-helpers.ts', generateFlowHelpers()],
    ['src/__generated__/step-types.ts', generateStepTypes()],
    [STEPS_BUILD_MODULE, generateStepsBuild()],
    ['src/__generated__/dsl-types-fe.ts', generateDslTypesFe()],
  ] as [string, string][]).filter(([, content]) => content);

  return Object.fromEntries(files);
}
