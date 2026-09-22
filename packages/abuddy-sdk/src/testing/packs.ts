// The registered packs in unit tests that run without an app: a plain in-memory stand-in tests fill directly.
// startTestRuntime binds it over the registry it's given (the harness's), so what a test puts here is found first.
import type { PackRegistryView } from '../runtime/packs-view.ts';
import type { FeatureRef } from '../ids/refs.ts';
import type { StepDefinition } from '../steps/types.ts';
import { _mergeStepDefinitions } from '../steps/merge.ts';
import type { ArtifactDefinition } from '../artifacts/types.ts';
import type { BlockDefinition } from '../blocks/types.ts';
import type { SeedHooks } from '../seed/hooks.ts';
import type { Seeder } from '../utils/seed.ts';
import type { PackCommand } from '../framework/pack-commands.ts';
import type { PackSettingsDefaults } from '../framework/pack-settings.ts';
import { SDK_ENTITIES, SDK_REL_KINDS } from '../types/sdk-entities.ts';

/** What tests register without an app, each lookup keyed as the SDK looks it up */
export interface TestPacks {
  /** Role → id of the system that plays it */
  readonly designations: Map<string, string>;
  /** Step definitions by type */
  readonly steps: Map<string, StepDefinition>;
  /** Artifact definitions by type */
  readonly artifacts: Map<string, ArtifactDefinition>;
  /** Block definitions by type */
  readonly blocks: Map<string, BlockDefinition>;
  /** Services by name, over the registered packs' */
  readonly services: Map<string, unknown>;
  /** Seed hooks by entity type */
  readonly seedHooks: Map<string, SeedHooks>;
  /** Seeders by pack id */
  readonly seeders: Map<string, Seeder[]>;
  /** Declared commands by pack id, after the registered packs' */
  readonly commands: Map<string, PackCommand[]>;
  /** Entity types by the name they're declared under, over the registered packs' */
  readonly earsEntities: Map<string, string>;
  /** Relation kinds by the name they're declared under, over the registered packs' */
  readonly earsRelKinds: Map<string, string>;
  /** Empties every lookup */
  clear(): void;
}

function createTestPacks(): TestPacks {
  const lookups = {
    designations: new Map<string, string>(),
    steps: new Map<string, StepDefinition>(),
    artifacts: new Map<string, ArtifactDefinition>(),
    blocks: new Map<string, BlockDefinition>(),
    services: new Map<string, unknown>(),
    seedHooks: new Map<string, SeedHooks>(),
    seeders: new Map<string, Seeder[]>(),
    commands: new Map<string, PackCommand[]>(),
    earsEntities: new Map<string, string>(),
    earsRelKinds: new Map<string, string>(),
  };
  return {
    ...lookups,
    clear: () => Object.values(lookups).forEach((lookup) => lookup.clear()),
  };
}

/** The in-memory stand-in for the registered packs that `startTestRuntime` binds */
export const testPacks: TestPacks = createTestPacks();

const noSettings: PackSettingsDefaults = { revision: 0, settings: { plugins: {} }, visibility: {} };

/** Definitions of `registered` with the ones tests put in `own` in place of those of the same type, then the rest of `own` */
function withOwn<T extends { type: string }>(registered: readonly T[] = [], own: Map<string, T>): T[] {
  return [...registered.filter((def) => !own.has(def.type)), ...own.values()];
}

/** A test's step definitions over the registered ones: a type both define is merged facet by facet, as the registry merges a pack's */
function stepsWithOwn(registered: readonly StepDefinition[] = []): StepDefinition[] {
  const own = testPacks.steps;
  const merged = registered.map((def) => (own.has(def.type) ? _mergeStepDefinitions(def, own.get(def.type)!) : def));
  const registeredTypes = new Set(registered.map((def) => def.type));
  return [...merged, ...[...own.values()].filter((def) => !registeredTypes.has(def.type))];
}

/** The view `startTestRuntime` binds: `testPacks`, then the registry it was given */
export function testPacksView(registered?: PackRegistryView): PackRegistryView {
  return {
    // A test names a role's id as it likes; it stands for a ref here
    designation: (role) => (testPacks.designations.get(role) as FeatureRef | undefined) ?? registered?.designation(role),
    step: (type) => {
      const own = testPacks.steps.get(type);
      const def = registered?.step(type);
      return own && def ? _mergeStepDefinitions(def, own) : own ?? def;
    },
    steps: () => stepsWithOwn(registered?.steps()),
    artifact: (type) => testPacks.artifacts.get(type) ?? registered?.artifact(type),
    artifacts: () => withOwn(registered?.artifacts(), testPacks.artifacts),
    block: (type) => testPacks.blocks.get(type) ?? registered?.block(type),
    blocks: () => withOwn(registered?.blocks(), testPacks.blocks),
    getRegisteredServices: () => ({ ...registered?.getRegisteredServices(), ...Object.fromEntries(testPacks.services) }),
    systemIds: () => registered?.systemIds() ?? [],
    pluginIds: () => registered?.pluginIds() ?? [],
    seedHooks: (entity) => testPacks.seedHooks.get(entity) ?? registered?.seedHooks(entity),
    seeders: (packId) => testPacks.seeders.get(packId) ?? registered?.seeders(packId) ?? [],
    settingsDefaults: () => registered?.settingsDefaults() ?? noSettings,
    onSettingsDefaultsChanged: (listener) => registered?.onSettingsDefaultsChanged(listener) ?? (() => {}),
    commands: () => [...(registered?.commands() ?? []), ...[...testPacks.commands.values()].flat()],
    earsNames: () => {
      const base = registered?.earsNames() ?? { entities: { ...SDK_ENTITIES }, relKinds: { ...SDK_REL_KINDS } };
      return {
        entities: { ...base.entities, ...Object.fromEntries(testPacks.earsEntities) },
        relKinds: { ...base.relKinds, ...Object.fromEntries(testPacks.earsRelKinds) },
      };
    },
  };
}
