// The packs whose frontends the renderer registered, as an instance: the renderer creates one and binds its read
// face for the SDK's frontend lookups (`bindFeHost({ packs })`). It holds the only writes to it.
import type { Plugin, PackFERegistration, TiptapPlugin, DslTypeConfig } from '@abuddy/sdk/fe';
import type { FePackRegistryView } from '@abuddy/sdk/runtime';
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import type { BlockDefinition } from '@abuddy/sdk/blocks';
import { addContributions, createDefinitionStore, createDesignationStore, createOwnedStore, createStepStore, definitions, type Contribution } from '../packs/extensions.ts';
import { resolveName, type FeatureRef } from '@abuddy/sdk/ids';
import { createAppExtensionSlots } from './app-extensions.ts';
import { checkFeatureIds } from '../packs/feature-ids.ts';

interface PackFEExtensions {
  /** The plugins this pack added */
  plugins: Plugin[];
  /** Takes back everything it added, as recorded where each part went in */
  undo: () => unknown;
}

/** The renderer's registered pack frontends */
export interface FePackRegistry extends FePackRegistryView {
  /** Registers a pack's frontend, and returns its plugins as registered: each at its feature's ref */
  registerPackFE(registration: PackFERegistration): Plugin[];
  /** Unregisters a pack's frontend; returns the plugins it had added */
  unregisterPackFE(packId: string): Plugin[];
  /** Every registered plugin, in registration order */
  getRegisteredPlugins(): Plugin[];
  /** The plugin to open when the app starts: the first registered pack's that claims it; throws when none does */
  getRegisteredDefaultPlugin(): Plugin;
  getAppExtension(slot: string): ReturnType<FePackRegistryView['appExtension']>;
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

/** Pushes each of `items` onto `list`, recording how to take that item back out */
function listed<T>(list: T[], items: readonly T[] | undefined, undo: (fn: () => void) => void): void {
  for (const item of items ?? []) {
    list.push(item);
    undo(() => {
      const idx = list.indexOf(item);
      if (idx >= 0) list.splice(idx, 1);
    });
  }
}

/** A new, empty frontend registry */
export function createFePackRegistry(): FePackRegistry {
  const allPlugins: Plugin[] = [];
  let defaultPlugin: Plugin | undefined;
  const packExtensions = new Map<string, PackFEExtensions>();
  const designations = createDesignationStore();
  const steps = createStepStore();
  const artifacts = createDefinitionStore<ArtifactDefinition>();
  const blocks = createDefinitionStore<BlockDefinition>();
  const tiptapPlugins: TiptapPlugin[] = [];
  const appExtensions = createAppExtensionSlots();
  const dslTypes = createOwnedStore<DslTypeConfig>();

  /** What a pack's frontend contributes, each kind recording how to take it back out (as the backend registry does) */
  const contributions: ReadonlyArray<Contribution<AddressedRegistration>> = [
    // First, so a role another pack plays refuses the pack before anything else of it is in, as the backend's does
    (reg, undo) => {
      designations.register(reg.roles);
      undo(() => designations.unregister(reg.roles));
    },
    (reg, undo) => listed(allPlugins, reg.addressed.map(({ plugin }) => plugin), undo),
    // The first pack to claim the default keeps it
    (reg, undo) => {
      const claim = reg.addressed.find((feature) => feature.default);
      if (!claim || defaultPlugin) return;
      defaultPlugin = claim.plugin;
      undo(() => { defaultPlugin = undefined; });
    },
    (reg, undo) => listed(tiptapPlugins, reg.tiptapPlugins, undo),
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

  function registerPackFE(registration: PackFERegistration): Plugin[] {
    const packId = registration.id;
    if (packExtensions.has(packId)) {
      throw new Error(`Pack "${packId}" frontend is already registered`);
    }
    checkFeatureIds(packId, Object.keys(registration.features ?? {}));
    // All or nothing: a throw partway (a step's `loadComponents`, a role collision) leaves the registry as it was
    const reg = addressed(registration);
    const undos = addContributions(reg, contributions);
    const plugins = reg.addressed.map(({ plugin }) => plugin);
    packExtensions.set(packId, { plugins, undo: undos.undoAll });
    return plugins;
  }

  function unregisterPackFE(packId: string): Plugin[] {
    const contrib = packExtensions.get(packId);
    if (!contrib) return [];

    contrib.undo();
    packExtensions.delete(packId);
    return contrib.plugins;
  }

  return {
    registerPackFE,
    unregisterPackFE,
    getRegisteredPlugins: () => allPlugins,
    getRegisteredDefaultPlugin() {
      if (!defaultPlugin) {
        throw new Error('No default plugin registered: no registered pack claims one (a feature with `default`)');
      }
      return defaultPlugin;
    },
    getAppExtension: appExtensions.get,

    // The SDK's frontend lookups (FePackRegistryView)
    designation: designations.get,
    step: steps.get,
    steps: steps.all,
    artifact: artifacts.get,
    artifacts: artifacts.all,
    block: blocks.get,
    blocks: blocks.all,
    plugins: () => allPlugins,
    defaultPlugin: () => defaultPlugin,
    tiptapPlugins: () => tiptapPlugins,
    appExtension: appExtensions.get,
    dslTypes: () => dslTypes.entries(),
  };
}
