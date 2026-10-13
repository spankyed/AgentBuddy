// The packs whose frontends the renderer registered, as an instance: the renderer creates one and binds its read
// face for the SDK's frontend lookups (`bindFeHost({ packs })`). It holds the only writes to it.
import type { Plugin, PackFERegistration, TiptapPlugin, DslTypeConfig, SettingsPort } from '@apackdev/sdk/fe';
import type { FePackRegistryView } from '@apackdev/sdk/runtime';
import type { ArtifactDefinition } from '@apackdev/sdk/artifacts';
import type { BlockDefinition } from '@apackdev/sdk/blocks';
import { addContributions, createDefinitionStore, createDesignationStore, createOwnedStore, createStepStore, definitions, type Contribution } from '../packs/extensions.ts';
import { resolveName, type FeatureRef } from '@apackdev/sdk/ids';
import { createAppExtensionSlots } from './app-extensions.ts';
import { checkFeatureIds } from '../packs/feature-ids.ts';
import { settingsTargetPath, type SettingsTarget } from '@apackdev/sdk/types';
import { createLogger } from '@apackdev/sdk/logger';

type SettingsForm = NonNullable<PackFERegistration['settingsForms']>[string];

const formKey = (target: SettingsTarget): string => settingsTargetPath(target).join('/');

interface PackFEExtensions {
  /** The plugins this pack added */
  plugins: Plugin[];
  /** Takes back everything it added, as recorded where each part went in */
  undo: () => unknown;
}

/** Host-owned settings resource for one accepted frontend, including transport cleanup. */
export interface FrontendSettingsBinding {
  port: SettingsPort;
  dispose(): void;
}

/** The renderer's registered pack frontends */
export interface FePackRegistry extends FePackRegistryView {
  /** Registers a pack's frontend, and returns its plugins as registered: each at its feature's ref */
  registerPackFE(registration: PackFERegistration, settings?: FrontendSettingsBinding): Plugin[];
  /** Unregisters a pack's frontend; returns the plugins it had added */
  unregisterPackFE(packId: string): Plugin[];
  /** Every registered plugin, in registration order */
  getRegisteredPlugins(): Plugin[];
  getAppExtension(slot: string): ReturnType<FePackRegistryView['appExtension']>;
  /** Lookup of an accepted form; installed declarations remain separate from executable availability. */
  settingsForm(target: SettingsTarget): SettingsForm | undefined;
  /** The accepted forms change only after a registration or removal commits. */
  onSettingsFormsChanged(listener: () => void): () => void;
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
  const features = Object.entries(registration.features ?? {});
  return {
    ...registration,
    addressed: features.flatMap(([featureId, feature]) => feature.plugin
      ? [{ plugin: { ...feature.plugin, id: resolveName(featureId, registration.id) } as Plugin, default: feature.default }]
      : []),
    roles: Object.fromEntries(features.flatMap(([featureId, { designation }]) =>
      designation ? [[designation, resolveName(featureId, registration.id)]] : [])),
  };
}

/**
 * Pushes each of `items` onto `list`, recording how to take that item back out.
 *
 * Removal is by value, which is safe only where no two packs can contribute the same object. Its one
 * caller is the plugin list, and a plugin comes from the pack's own feature, so it cannot be shared. For a
 * kind that can be, use `createOwnedList`.
 */
function listed<T>(list: T[], items: readonly T[] | undefined, undo: (fn: () => void) => void): void {
  for (const item of items ?? []) {
    list.push(item);
    undo(() => {
      const idx = list.indexOf(item);
      if (idx >= 0) list.splice(idx, 1);
    });
  }
}

/**
 * A list of contributions kept with the pack that made each, for a kind whose items have no key to collide
 * on — which is every kind `createOwnedStore` cannot hold.
 *
 * Removal is by **contribution**, not by value. Two packs can contribute the same object: `@apackdev/sdk` is
 * a shared instance, so a tiptap plugin a dependency exports is the same reference in both packs, and
 * removing it by `indexOf` takes the first occurrence — which may be the other pack's, leaving the
 * unregistered pack's behind.
 */
function createOwnedList<T>() {
  let held: Array<{ owner: string; value: T }> = [];
  return {
    register(owner: string, items: readonly T[] | undefined): void {
      for (const value of items ?? []) held.push({ owner, value });
    },
    unregister(owner: string): void {
      held = held.filter((entry) => entry.owner !== owner);
    },
    /** In registration order, which is load-bearing: tiptap resolves equal-priority extensions by it */
    all: (): T[] => held.map((entry) => entry.value),
  };
}

/** A new, empty frontend registry */
export function createFePackRegistry(): FePackRegistry {
  const logger = createLogger('pack-frontends');
  const allPlugins: Plugin[] = [];
  let defaultPlugin: Plugin | undefined;
  const packExtensions = new Map<string, PackFEExtensions>();
  const designations = createDesignationStore();
  const steps = createStepStore();
  const artifacts = createDefinitionStore<ArtifactDefinition>();
  const blocks = createDefinitionStore<BlockDefinition>();
  const tiptapPlugins = createOwnedList<TiptapPlugin>();
  const appExtensions = createAppExtensionSlots();
  const dslTypes = createOwnedStore<DslTypeConfig>();
  const settingsForms = createOwnedStore<SettingsForm>();
  let publishedForms: ReadonlyMap<string, SettingsForm> = new Map();
  const formListeners = new Set<() => void>();
  function publishForms() {
    publishedForms = new Map(settingsForms.entries());
    for (const listener of formListeners) {
      try { listener(); }
      catch (error) { logger.error('Settings form listener failed', error instanceof Error ? error : new Error(String(error))); }
    }
  }

  /** What a pack's frontend contributes, each kind recording how to take it back out (as the backend registry does) */
  const contributions: ReadonlyArray<Contribution<AddressedRegistration>> = [
    // First, so a role another pack plays refuses the pack before anything else of it is in, as the backend's does
    (reg, undo) => {
      designations.register(reg.roles);
      undo(() => designations.unregister(reg.roles));
    },
    (reg, undo) => listed(allPlugins, reg.addressed.map(({ plugin }) => plugin), undo),
    (reg, undo) => {
      const register = (target: SettingsTarget, component: SettingsForm) => {
        const key = formKey(target);
        settingsForms.set(key, component, reg.id);
        undo(() => settingsForms.remove(key, reg.id));
      };
      for (const [featureId, feature] of Object.entries(reg.features ?? {})) {
        if (feature.settingsForm) register({ kind: 'feature', featureRef: resolveName(featureId, reg.id) }, feature.settingsForm);
      }
      for (const [groupId, component] of Object.entries(reg.settingsForms ?? {})) {
        register({ kind: 'pack', packId: reg.id, groupId }, component);
      }
    },
    // The first pack to claim the default keeps it
    (reg, undo) => {
      const claim = reg.addressed.find((feature) => feature.default);
      if (!claim || defaultPlugin) return;
      defaultPlugin = claim.plugin;
      undo(() => { defaultPlugin = undefined; });
    },
    (reg, undo) => {
      tiptapPlugins.register(reg.id, reg.tiptapPlugins);
      undo(() => tiptapPlugins.unregister(reg.id));
    },
    (reg, undo) => {
      for (const [slot, component] of Object.entries(reg.appExtensions ?? {})) {
        appExtensions.register(slot, component, reg.id);
        undo(() => appExtensions.unregister(slot, reg.id));
      }
    },
    definitions(artifacts, (reg) => reg.artifacts),
    definitions(blocks, (reg) => reg.blocks),
    // Each step's components, loaded once, off the pack's own `fe` — the object every merged definition of the type
    // hands out, since merging keeps the facet by reference. Loaded here, `loadComponents` (the pack's own code)
    // can't run inside another pack's registration and fail it.
    definitions(steps, (reg) => reg.steps, (step) => {
      if (step.fe?.loadComponents && !step.fe.components) step.fe.components = step.fe.loadComponents();
    }),
    (reg, undo) => {
      for (const [name, config] of Object.entries(reg.dslTypes ?? {})) {
        dslTypes.set(name, config, reg.id);
        undo(() => dslTypes.remove(name, reg.id));
      }
    },
  ];

  function registerPackFE(registration: PackFERegistration, settings?: FrontendSettingsBinding): Plugin[] {
    const packId = registration.id;
    let reg: AddressedRegistration;
    try {
      if (packExtensions.has(packId)) throw new Error(`Pack "${packId}" frontend is already registered`);
      checkFeatureIds(packId, Object.keys(registration.features ?? {}));
      checkFeatureIds(packId, Object.keys(registration.settingsForms ?? {}));
      reg = addressed(registration);
    } catch (error) {
      settings?.dispose();
      throw error;
    }
    // All or nothing: a throw partway (a step's `loadComponents`, a role collision) leaves the registry as it was
    const undos = addContributions(reg, [
      (_, undo) => { if (settings) undo(() => settings.dispose()); },
      ...contributions,
      (accepted, undo) => {
        if (!accepted.bindSettings) return;
        if (!settings) throw new Error(`Pack "${accepted.id}" frontend requires host-bound settings access`);
        undo(accepted.bindSettings(settings.port));
      },
    ]);
    const plugins = reg.addressed.map(({ plugin }) => plugin);
    packExtensions.set(packId, { plugins, undo: undos.undoAll });
    publishForms();
    return plugins;
  }

  function unregisterPackFE(packId: string): Plugin[] {
    const contrib = packExtensions.get(packId);
    if (!contrib) return [];

    try { contrib.undo(); }
    finally {
      packExtensions.delete(packId);
      publishForms();
    }
    return contrib.plugins;
  }

  return {
    registerPackFE,
    unregisterPackFE,
    getRegisteredPlugins: () => allPlugins,
    getAppExtension: appExtensions.get,
    settingsForm: target => publishedForms.get(formKey(target)),
    onSettingsFormsChanged(listener) { formListeners.add(listener); return () => { formListeners.delete(listener); }; },

    // The SDK's frontend lookups (FePackRegistryView)
    designation: designations.get,
    step: steps.get,
    steps: steps.all,
    artifact: artifacts.get,
    artifacts: artifacts.all,
    block: blocks.get,
    blocks: blocks.all,
    plugins: () => allPlugins,
    // **No throwing counterpart, because at startup the answer is legitimately "not yet".** Every pack's
    // frontend loads after the window is up, so a caller demanding a default plugin could not run at all:
    // the shell waits for one instead (`wantsDefaultPlugin`). Absent until a pack claims it
    defaultPlugin: () => defaultPlugin,
    tiptapPlugins: tiptapPlugins.all,
    appExtension: appExtensions.get,
    dslTypes: () => dslTypes.entries(),
  };
}
