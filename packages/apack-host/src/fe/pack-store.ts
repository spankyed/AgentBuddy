// The packs whose frontends the renderer registered, as an instance: the renderer creates one and binds its read
// face for the SDK's frontend lookups (`bindFeHost({ packs })`). It holds the only writes to it.
import type { ReferenceTypeConfig, ReferenceBindings, ReferenceBinding } from '@apackdev/sdk/fe/references';
import type { Plugin, PackFERegistration, TiptapPlugin, DslTypeConfig, SettingsPort } from '@apackdev/sdk/fe';
import type { FePackRegistryView } from '@apackdev/sdk/runtime';
import type { ArtifactDefinition } from '@apackdev/sdk/artifacts';
import type { BlockDefinition } from '@apackdev/sdk/blocks';
import { createDesignationStore, createOwnedStore } from '../packs/extensions.ts';
import { resolveName, type FeatureRef } from '@apackdev/sdk/ids';
import { _mergeStepDefinitions, type StepDefinition } from '@apackdev/sdk/steps';
import { createFrontendSettingsBinding } from './settings-binding.ts';
import { checkFeatureIds } from '../packs/feature-ids.ts';
import { settingsTargetPath, type SettingsTarget } from '@apackdev/sdk/types';
import { createLogger } from '@apackdev/sdk/logger';
import type { NativePackDeclaration } from '@apackdev/sdk/framework';
import { captureFrontendBindings } from './binding-snapshot.ts';
import { frontendBindingProblem } from './declaration-binding.ts';

/** Supplied by the host loader, separate from a module's authored registration. */
export interface FrontendIdentity {
  runtimeRevision: string;
  buildRevision?: string;
}

type OwnedReferenceBindings = {
  types: Record<string, ReferenceBinding<ReferenceTypeConfig>>;
  categories: Record<string, ReferenceBinding<ReferenceBindings['categories'][string]>>;
};

type SettingsForm = NonNullable<PackFERegistration['settingsForms']>[string];

const formKey = (target: SettingsTarget): string => settingsTargetPath(target).join('/');

/** Host-owned settings resource for one accepted frontend, including transport cleanup. */
export interface FrontendSettingsBinding {
  port: SettingsPort;
  dispose(): void;
}

/** The renderer's registered pack frontends */
export interface FePackRegistry extends FePackRegistryView {
  /** Registers a pack's frontend, and returns its plugins as registered: each at its feature's ref */
  registerPackFE(registration: PackFERegistration, settings?: FrontendSettingsBinding): Plugin[];
  /** Prepare a fresh or replacement frontend without publishing it; disposal cancels only this candidate. */
  preparePackFE(registration: PackFERegistration, settings?: FrontendSettingsBinding, replacing?: boolean, identity?: FrontendIdentity): PreparedFrontend;
  /** Replace an existing owner; failure preserves its accepted resources. */
  replacePackFE(registration: PackFERegistration, settings?: FrontendSettingsBinding): Plugin[];
  hasPackFE(packId: string): boolean;
  prepareUnregisterPackFE(packId: string): PreparedFrontend;
  /** Unregisters a pack's frontend; returns the plugins it had added */
  unregisterPackFE(packId: string): Plugin[];
  /** Every registered plugin, in registration order */
  getRegisteredPlugins(): Plugin[];
  getAppExtension(slot: string): ReturnType<FePackRegistryView['appExtension']>;
  /** Lookup of an accepted form; installed declarations remain separate from executable availability. */
  settingsForm(target: SettingsTarget): SettingsForm | undefined;
}

/**
 * A registration addressed once: each plugin at its feature's ref, with its default claim, and each role at the ref of
 * the feature that plays it, that feature's plugin or not
 */
type AddressedRegistration = PackFERegistration & {
  addressed: Array<{ plugin: Plugin; default?: true }>;
  roles: Record<string, FeatureRef>;
};

function addressed(registration: PackFERegistration): AddressedRegistration {
  const features = Object.entries(registration.features ?? {}).map(([id, feature]) => [id, { ...feature }] as const);
  const defaults = features.filter(([, feature]) => feature.default);
  if (defaults.length > 1) throw new Error(`Pack "${registration.id}" declares default plugins "${defaults[0]![0]}" and "${defaults[1]![0]}"; only one may be claimed`);
  if (defaults[0] && !defaults[0][1].plugin) throw new Error(`Pack "${registration.id}" declares a default for feature "${defaults[0][0]}" without a plugin`);
  const roles = new Map<string, FeatureRef>();
  for (const [id, feature] of features) {
    if (!feature.designation) continue;
    if (roles.has(feature.designation)) throw new Error(`Pack "${registration.id}" declares designation "${feature.designation}" twice`);
    roles.set(feature.designation, resolveName(id, registration.id));
  }
  return {
    ...registration,
    features: Object.fromEntries(features),
    addressed: features.flatMap(([featureId, feature]) => feature.plugin
      ? [{ plugin: { ...feature.plugin, id: resolveName(featureId, registration.id) } as Plugin, default: feature.default }]
      : []),
    roles: Object.fromEntries(roles),
  };
}

/** A staged frontend cannot change the published view until its commit. */
export interface PreparedFrontend {
  plugins: Plugin[];
  /** Commit other prepared host resources after revision checks, before publishing the lookup view. */
  commit(beforePublish?: () => void): Plugin[];
  dispose(): void;
}

type DefinitionEntry<T> = readonly [string, T];
interface FrontendContributions {
  id: string;
  addressed: AddressedRegistration['addressed'];
  roles: Record<string, FeatureRef>;
  forms: Array<readonly [string, SettingsForm]>;
  steps: Array<DefinitionEntry<StepDefinition>>;
  artifacts: Array<DefinitionEntry<ArtifactDefinition>>;
  blocks: Array<DefinitionEntry<BlockDefinition>>;
  tiptapPlugins: Array<[string, TiptapPlugin]>;
  appExtensions: Array<readonly [string, SettingsForm]>;
  dslTypes: Array<readonly [string, DslTypeConfig]>;
  references: OwnedReferenceBindings[];
  bindSettings: PackFERegistration['bindSettings'];
}

function captureReferenceType(type: ReferenceTypeConfig): ReferenceTypeConfig {
  const svgElements = structuredClone(type.svgElements);
  for (const element of svgElements) { Object.freeze(element[1]); Object.freeze(element); }
  return Object.freeze({ ...type, svgElements: Object.freeze(svgElements) });
}

function capture(registration: PackFERegistration, identity?: FrontendIdentity): FrontendContributions {
  const reg = addressed({ ...registration });
  const runtimeRevision = identity?.runtimeRevision;
  const buildRevision = identity?.buildRevision;
  checkFeatureIds(reg.id, Object.keys(reg.features ?? {}));
  checkFeatureIds(reg.id, Object.keys(reg.settingsForms ?? {}));
  return {
    id: reg.id, addressed: reg.addressed, roles: reg.roles, bindSettings: reg.bindSettings,
    forms: [
      ...Object.entries(reg.features ?? {}).flatMap(([id, feature]) => feature.settingsForm
        ? [[formKey({ kind: 'feature', featureRef: resolveName(id, reg.id) }), feature.settingsForm] as const] : []),
      ...Object.entries(reg.settingsForms ?? {}).map(([id, component]) => [formKey({ kind: 'pack', packId: reg.id, groupId: id }), component] as const),
    ],
    references: Object.entries(reg.features ?? {}).flatMap(([id, feature]) => {
      const references = feature.references;
      if (!references) return [];
      const owner = { featureRef: resolveName(id, reg.id),
        ...(reg.declarationRevision !== undefined ? { declarationRevision: reg.declarationRevision } : {}),
        ...(runtimeRevision !== undefined ? { runtimeRevision } : {}),
        ...(buildRevision !== undefined ? { buildRevision } : {}) };
      return [{
        types: Object.fromEntries(Object.entries(references.types).map(([name, type]) => [name,
          Object.freeze({ ...owner, binding: captureReferenceType(type) })])),
        categories: Object.fromEntries(Object.entries(references.categories).map(([name, category]) => [name,
          Object.freeze({ ...owner, binding: Object.freeze({ ...category }) })])),
      }];
    }),
    steps: (reg.steps ?? []).map(value => [value.type, value]),
    artifacts: (reg.artifacts ?? []).map(value => [value.type, value]),
    blocks: (reg.blocks ?? []).map(value => [value.type, value]),
    tiptapPlugins: Object.entries(reg.tiptapPlugins ?? {}),
    appExtensions: Object.entries(reg.appExtensions ?? {}), dslTypes: Object.entries(reg.dslTypes ?? {}),
  };
}

function buildTables(packs: Iterable<FrontendContributions>) {
  const plugins: Plugin[] = [];
  let defaultPlugin: Plugin | undefined;
  const designations = createDesignationStore();
  const steps = createOwnedStore<StepDefinition>(_mergeStepDefinitions);
  const artifacts = createOwnedStore<ArtifactDefinition>();
  const blocks = createOwnedStore<BlockDefinition>();
  const appExtensions = createOwnedStore<SettingsForm>();
  const dslTypes = createOwnedStore<DslTypeConfig>();
  const forms = new Map<string, SettingsForm>();
  const tiptapPlugins: TiptapPlugin[] = [];
  const editorOwners = new Map<string, string>();
  const referenceTypes = new Map<string, ReferenceBinding<ReferenceTypeConfig>>();
  const referenceCategories = new Map<string, ReferenceBinding<ReferenceBindings['categories'][string]>>();
  const referenceOwners = { types: new Map<string, FeatureRef>(), categories: new Map<string, FeatureRef>() };
  const claim = (kind: keyof typeof referenceOwners, name: string, owner: FeatureRef) => {
    const previous = referenceOwners[kind].get(name);
    if (previous !== undefined) throw new Error(`Reference ${kind} "${name}" claimed by both features "${previous}" and "${owner}"`);
    referenceOwners[kind].set(name, owner);
  };
  for (const pack of packs) {
    for (const references of pack.references) {
      for (const [name, type] of Object.entries(references.types)) {
        claim('types', name, type.featureRef);
        referenceTypes.set(name, type);
      }
      for (const [name, category] of Object.entries(references.categories)) {
        claim('categories', name, category.featureRef);
        referenceCategories.set(name, category);
      }
    }
    designations.register(pack.roles);
    plugins.push(...pack.addressed.map(({ plugin }) => plugin));
    defaultPlugin ??= pack.addressed.find(feature => feature.default)?.plugin;
    for (const [key, value] of pack.forms) forms.set(key, value);
    for (const [key, value] of pack.steps) steps.set(key, value, pack.id);
    for (const [key, value] of pack.artifacts) artifacts.set(key, value, pack.id);
    for (const [key, value] of pack.blocks) blocks.set(key, value, pack.id);
    for (const [key, value] of pack.appExtensions) appExtensions.set(key, value, pack.id);
    for (const [key, value] of pack.dslTypes) dslTypes.set(key, value, pack.id);
    for (const [id, plugin] of pack.tiptapPlugins) {
      const owner = `${pack.id}/${id}`;
      for (const name of Object.keys(plugin.extensions ?? {})) {
        const previous = editorOwners.get(name);
        if (previous !== undefined) throw new Error(`Tiptap extension "${name}" declared by both "${previous}" and "${owner}"`);
        editorOwners.set(name, owner);
      }
      tiptapPlugins.push(plugin);
    }
  }
  return { plugins, defaultPlugin, designations, steps, artifacts, blocks, appExtensions, dslTypes, forms, tiptapPlugins, referenceTypes, referenceCategories };
}

/** Published lookup data and executable resource lifetime have separate commit/retirement paths. */
export function createFePackRegistry(options: { nativeDeclarations?: readonly NativePackDeclaration[] } = {}): FePackRegistry {
  const native = new Map((options.nativeDeclarations ?? []).map(declaration => [declaration.id, structuredClone(declaration)]));
  if (native.size !== (options.nativeDeclarations ?? []).length) throw new Error('Duplicate native frontend declaration owner');
  const logger = createLogger('pack-frontends');
  let accepted = new Map<string, FrontendContributions>();
  let tables = buildTables(accepted.values());
  const bindings = new Map<string, ReturnType<typeof createFrontendSettingsBinding>>();
  const listeners = new Set<(packId: string) => void>();
  let revision = 0;
  let changing = false;
  function mutate<T>(operation: () => T): T {
    if (changing) throw new Error('A frontend registry change is already in progress');
    changing = true;
    try { return operation(); } finally { changing = false; }
  }
  function publishChange(packId: string) {
    for (const listener of listeners) {
      try { listener(packId); }
      catch (error) { logger.error('Frontend registry listener failed', error instanceof Error ? error : new Error(String(error))); }
    }
  }
  function retire(binding: ReturnType<typeof createFrontendSettingsBinding> | undefined) {
    const errors = binding?.dispose() ?? [];
    if (errors.length) logger.error('Frontend resource retirement failed', new AggregateError(errors, 'Frontend resource retirement failed'));
  }
  function prepareChange(id: string, next: Map<string, FrontendContributions>, projected: ReturnType<typeof buildTables>,
    binding: ReturnType<typeof createFrontendSettingsBinding> | undefined, plugins: Plugin[]): PreparedFrontend {
    const before = revision;
    let state: 'pending' | 'committed' | 'disposed' = 'pending';
    const discard = () => {
      if (state !== 'pending') return;
      state = 'disposed';
      retire(binding);
    };
    const dispose = () => { if (changing) discard(); else mutate(discard); };
    return {
      plugins,
      commit(beforePublish) {
        try { return mutate(() => {
          if (state !== 'pending') throw new Error('Only a pending frontend may commit');
          if (revision !== before) throw new Error('The frontend registry changed while this candidate was prepared');
          binding?.activate();
          beforePublish?.();
          if (state !== 'pending') throw new Error('Frontend preparation was disposed before publication');
          const previous = bindings.get(id);
          accepted = next;
          tables = projected;
          if (binding) bindings.set(id, binding); else bindings.delete(id);
          state = 'committed';
          revision++;
          retire(previous);
          publishChange(id);
          return plugins;
        }); } catch (error) { dispose(); throw error; }
      },
      dispose,
    };
  }
  function prepareUnregisterPackFE(id: string): PreparedFrontend {
    return mutate(() => {
      if (!accepted.has(id)) throw new Error(`Pack "${id}" frontend is not registered`);
      const next = new Map(accepted);
      next.delete(id);
      return prepareChange(id, next, buildTables(next.values()), undefined, []);
    });
  }
  function preparePackFE(registration: PackFERegistration, settings?: FrontendSettingsBinding, replacing = false, identity?: FrontendIdentity): PreparedFrontend {
    registration = captureFrontendBindings(registration);
    const declaration = native.get(registration.id);
    if (declaration) {
      const problem = frontendBindingProblem({ id: declaration.id, features: declaration.features,
        extensions: { settings: declaration.settings, tiptapPlugins: declaration.tiptapPlugins, appExtensions: declaration.appExtensions } }, registration);
      if (problem) throw new Error(problem);
    }
    const binding = createFrontendSettingsBinding(settings);
    try {
      return mutate(() => {
        const { id, ...definition } = registration;
        if (accepted.has(id) !== replacing) throw new Error(replacing
          ? `Pack "${id}" frontend is not registered` : `Pack "${id}" frontend is already registered`);
        const candidate = capture({ ...definition, id }, identity);
        const next = new Map(accepted);
        next.set(id, candidate);
        buildTables(next.values());
        // Only the candidate's loaders execute; rebuilding lookup tables never reruns pack code.
        candidate.steps = candidate.steps.map(([type, step]) => {
          const fe = step.fe;
          return fe?.loadComponents && !fe.components
            ? [type, { ...step, fe: { ...fe, components: fe.loadComponents() } }] : [type, step];
        });
        const projected = buildTables(next.values());
        binding.bind(candidate.bindSettings);
        return prepareChange(id, next, projected, binding, candidate.addressed.map(({ plugin }) => plugin));
      });
    } catch (error) {
      if (changing) retire(binding); else mutate(() => retire(binding));
      throw error;
    }
  }
  const accept = (registration: PackFERegistration, settings: FrontendSettingsBinding | undefined, replacing: boolean) => {
    const prepared = preparePackFE(registration, settings, replacing);
    try { return prepared.commit(); } finally { prepared.dispose(); }
  };
  function unregisterPackFE(id: string): Plugin[] {
    const previous = accepted.get(id);
    if (!previous) return [];
    const prepared = prepareUnregisterPackFE(id);
    try { prepared.commit(); } finally { prepared.dispose(); }
    return previous.addressed.map(({ plugin }) => plugin);
  }

  return {
    preparePackFE,
    prepareUnregisterPackFE,
    hasPackFE: id => accepted.has(id),
    registerPackFE: (registration, settings) => accept(registration, settings, false),
    replacePackFE: (registration, settings) => accept(registration, settings, true),
    unregisterPackFE,
    getRegisteredPlugins: () => [...tables.plugins],
    getAppExtension: key => tables.appExtensions.get(key),
    settingsForm: target => tables.forms.get(formKey(target)),
    onChanged(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    designation: key => tables.designations.get(key),
    step: key => tables.steps.get(key), steps: () => tables.steps.all(),
    artifact: key => tables.artifacts.get(key), artifacts: () => tables.artifacts.all(),
    block: key => tables.blocks.get(key), blocks: () => tables.blocks.all(),
    plugins: () => [...tables.plugins], defaultPlugin: () => tables.defaultPlugin,
    tiptapPlugins: () => [...tables.tiptapPlugins],
    referenceTypes: () => new Map(tables.referenceTypes),
    referenceCategories: () => new Map(tables.referenceCategories),
    appExtension: key => tables.appExtensions.get(key), dslTypes: () => new Map(tables.dslTypes.entries()),
  };
}
