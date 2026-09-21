/**
 * Pack Registration Types
 *
 * Contract that packs use to declare what they contribute to the host.
 * The host (API) owns the mutable registry; packs only reference these types.
 */

import type { FeatureAddress } from '../ids/addressing.ts';
import type { AnyStateMachine } from 'xstate';

export interface PackSystemDef {
  /** The system's address, `<packId>.<featureId>` (`toPackSystemDefs` gives it) */
  id: FeatureAddress;
  machine: AnyStateMachine;
  events: Set<string>;
}

export interface PackMigration {
  target: string;
  description: string;
  up: () => void;
}

export interface PackSeedManifest {
  /** The pack's seeded keys (`boot.seed`), each with a `<key>.seed.json` in `compiledDir` */
  seedKeys: string[];
  compiledDir: string;
  seedPolicy?: { skipAtBoot?: string[]; skipAfterOnboarding?: string[] };
}

export interface PackBootHooks {
  earlySystem?: AnyStateMachine;
  onInit?: () => void;
  onShutdown?: () => void;
  seedManifest?: PackSeedManifest;
}

export interface PackEARS {
  entities: Record<string, string>;
  relKinds: Record<string, string>;
  partitionPolicy?: {
    excludedEntityTypes?: string[];
  };
}

export interface PackFeatureDef {
  id: string;
  designation?: string;
  hasSystem: boolean;
  hasPlugin: boolean;
  services: string[];
  /** The feature's default settings (abuddy.json `features[].settings`) */
  settings?: import('./pack-settings.ts').FeatureSettings;
}

export interface PackRegistration {
  id: string;
  systems: PackSystemDef[];
  services?: Record<string, unknown>;
  ears?: PackEARS;
  /** The pack's repositories by name (abuddy.json `features[].repositories`), registered with the app's engine */
  repositories?: Record<string, unknown>;
  boot?: PackBootHooks;
  migrations?: PackMigration[];
  steps?: import('../steps/types.ts').StepDefinition[];
  artifacts?: import('../artifacts/types.ts').ArtifactDefinition[];
  blocks?: import('../blocks/types.ts').BlockDefinition[];
  /** Seed hooks for the entity types this pack owns (abuddy.json `seedHooks`) */
  seedHooks?: Record<string, import('../seed/hooks.ts').SeedHooks>;
  /** The pack's seeders, one per seeded key (abuddy.json `boot.seed`), which `seedData` runs for the pack's compiled seeds */
  seeders?: import('../utils/seed.ts').Seeder[];
  /** The slash commands this pack adds to the chat (abuddy.json `commands`) */
  commands?: import('./pack-commands.ts').PackCommand[];
  features?: PackFeatureDef[];
  /**
   * Feature id → the event types that feature's plugin receives, generated from the systems' declared
   * outgoing unions (`receivedEventTypes` in `#generated/events`). The app checks a send against it, as it
   * checks an incoming client event against what a system accepts. Only this pack's own plugins: a
   * dependency's and the host's are declared by whoever owns them, and the key is a feature id rather than
   * a plugin id for the same reason — the app addresses a plugin `<packId>.<featureId>` and qualifies these
   * keys itself, so naming another pack's plugin here isn't expressible.
   */
  receivedEventTypes?: Record<string, readonly string[]>;
}
