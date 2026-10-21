// The packs whose frontends the renderer registered, as an instance: the renderer creates one and binds its read
// face for the SDK's frontend lookups (`bindFeHost({ packs })`). It holds the only writes to it.
import type { Plugin, PackFERegistration, TiptapPlugin, DslTypeConfig } from '@apackdev/sdk/fe';
import type { FePackRegistryView } from '@apackdev/sdk/runtime';
import type { PackReferences, ReferenceTypeConfig, CategoryConfig, CategoryItemsProvider } from '@apackdev/sdk/fe/references';
import type { ArtifactDefinition } from '@apackdev/sdk/artifacts';
import type { BlockDefinition } from '@apackdev/sdk/blocks';
import { addContributions, createDefinitionStore, createDesignationStore, createOwnedStore, createStepStore, definitions, type Contribution } from '../packs/extensions.ts';
import { resolveName, type FeatureRef } from '@apackdev/sdk/ids';
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
  getAppExtension(slot: string): ReturnType<FePackRegistryView['appExtension']>;
}

/**
 * Who to tell when the registered pack frontends change, and the one call that tells them.
 *
 * One signal for the whole registry rather than one per contribution kind: every kind has the same cause, a
 * pack's frontend arriving or leaving, so per-kind signals would be several things nothing checks agree.
 * There is no revision number beside it, because every reader answers by asking the registry again.
 */
function createChangeListeners() {
  const listeners = new Set<() => void>();
  let scheduled = false;
  return {
    add(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * Told after this turn, never during the registration.
     *
     * A listener redraws, and the shell spawns the pack's plugin actors *after* `registerPackFE` has handed
     * back its plugins — so a component mounted from inside it reads a plugin that is registered and not yet
     * running, which a pack's own `usePluginState` throws over rather than renders. The app shows that as
     * "No plugin is running at <ref>, which is this pack's own".
     *
     * Deferring also collapses a run of registrations into one notification, which is what the pack loader
     * does: it registers each pack in turn, and every listener would otherwise redraw once per pack.
     */
    notify(): void {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        // The copy is the point: a listener added while these run belongs to the next notification, not this
        // one, and one that unsubscribes must not shorten the set being walked.
        // eslint-disable-next-line no-useless-spread
        for (const listener of [...listeners]) listener();
      });
    },
  };
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
 * Every pack's reference contributions, folded into one.
 *
 * Types key by name because that is what a reference carries (`ReferenceItem.type`, and the editor node's
 * stored attribute). The **protocol** is a second identity — `note://`, and `library`'s `document` type uses
 * the scheme `doc`, so the two are genuinely different facts — and it is the one that must be unique across
 * packs, since it is what a URL names. Nothing checked it before, because nothing an external pack declared
 * reached the app at all.
 */
function createReferenceStore() {
  const held = new Map<string, { owner: string; references: PackReferences }>();

  const fold = (): PackReferences => {
    const types: Record<string, ReferenceTypeConfig> = {};
    const categories: CategoryConfig[] = [];
    const itemsProviders: CategoryItemsProvider[] = [];
    for (const { references } of held.values()) {
      Object.assign(types, references.types);
      categories.push(...references.categories);
      itemsProviders.push(...references.itemsProviders);
    }
    return { types, categories, itemsProviders };
  };

  /** Who already claimed each type name and each protocol, so a second claim names both packs */
  const claimed = (pick: (type: ReferenceTypeConfig, name: string) => string) =>
    new Map([...held.values()].flatMap(({ owner, references }) =>
      Object.entries(references.types).map(([name, type]) => [pick(type, name), owner] as const)));

  return {
    register(owner: string, references: PackReferences | undefined): void {
      if (!references) return;
      const names = claimed((_type, name) => name);
      const protocols = claimed((type) => type.protocol);
      for (const [name, type] of Object.entries(references.types)) {
        const byName = names.get(name);
        if (byName) throw new Error(`Reference type collision: "${name}" — pack "${owner}" vs "${byName}"`);
        const byProtocol = protocols.get(type.protocol);
        if (byProtocol) throw new Error(`Reference protocol collision: "${type.protocol}://" — pack "${owner}" vs "${byProtocol}"`);
      }
      held.set(owner, { owner, references });
    },
    unregister(owner: string): void {
      held.delete(owner);
    },
    all: fold,
  };
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
  const references = createReferenceStore();
  const changes = createChangeListeners();

  /** What a pack's frontend contributes, each kind recording how to take it back out (as the backend registry does) */
  const contributions: ReadonlyArray<Contribution<AddressedRegistration>> = [
    // First, so a role another pack plays refuses the pack before anything else of it is in, as the backend's does
    (reg, undo) => {
      designations.register(reg.roles);
      undo(() => designations.unregister(reg.roles));
    },
    (reg, undo) => {
      references.register(reg.id, reg.references);
      undo(() => references.unregister(reg.id));
    },
    (reg, undo) => listed(allPlugins, reg.addressed.map(({ plugin }) => plugin), undo),
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
    // After the registration is in, so a listener that reads the registry sees this pack's contributions
    changes.notify();
    return plugins;
  }

  function unregisterPackFE(packId: string): Plugin[] {
    const contrib = packExtensions.get(packId);
    if (!contrib) return [];

    contrib.undo();
    packExtensions.delete(packId);
    changes.notify();
    return contrib.plugins;
  }

  return {
    registerPackFE,
    unregisterPackFE,
    getRegisteredPlugins: () => allPlugins,
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
    // **No throwing counterpart, because at startup the answer is legitimately "not yet".** Every pack's
    // frontend loads after the window is up, so a caller demanding a default plugin could not run at all:
    // the shell waits for one instead (`wantsDefaultPlugin`). Absent until a pack claims it
    defaultPlugin: () => defaultPlugin,
    tiptapPlugins: tiptapPlugins.all,
    appExtension: appExtensions.get,
    dslTypes: () => dslTypes.entries(),
    references: references.all,
    onRegisteredPacksChanged: changes.add,
  };
}
