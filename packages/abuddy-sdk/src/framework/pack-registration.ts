/**
 * Pack Registration Types
 *
 * Contract that packs use to declare what they contribute to the host.
 * The host (API) owns the mutable registry; packs only reference these types.
 */

import type { AnyStateMachine } from 'xstate';

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

/** A feature's backend system, which the app runs at the feature's ref, `<packId>/<featureId>` */
export interface PackFeatureSystem {
  machine: AnyStateMachine;
  /** The event types it accepts: its machine's, and those abuddy.json `system.events.incoming` adds (`packSystem`) */
  receives: readonly string[];
  /**
   * Started before hydration and outside the bus (a built-in pack's logs): it hears the sends to it with
   * `onIncoming`, which the app checks against `receives` like any other system's
   */
  early?: true;
}

/** What the backend knows of a feature's plugin: the event types it receives, which the app checks a send against */
export interface PackFeaturePlugin {
  /** Generated from its own feature's system's outgoing events and the inbox the plugin declares (`pluginAccepts()`) */
  receives: readonly string[];
}

/** One feature of a pack: whatever it has of a system, a plugin, a role, services and settings */
export interface PackFeature {
  designation?: string;
  system?: PackFeatureSystem;
  plugin?: PackFeaturePlugin;
  /** The keys of the services the feature provides, which `PackRegistration.services` holds */
  services?: readonly string[];
  /** The feature's default settings (abuddy.json `features[].settings`) */
  settings?: import('./pack-settings.ts').FeatureSettings;
}

export interface PackRegistration {
  id: string;
  /**
   * The pack's features by id. The app runs each at `<packId>/<featureId>` and derives the rest from here:
   * the systems it starts and the events each accepts, the plugins and what each receives, the roles.
   */
  features?: Record<string, PackFeature>;
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
  /**
   * Help entries this pack answers with, listed under Help in the app's Settings view (abuddy.json `help`).
   * Called the first time the list is read, so a pack whose help is compiled with its seeds can read them then.
   */
  help?: () => import('./pack-help.ts').HelpEntry[];
  /**
   * Sections of the app's settings this pack owns, with their defaults, beside the `plugins` section the app keeps
   * itself (abuddy.json `settingsSections`). A feature declares only its own slice (`features[].settings`); a
   * section is the pack's, and whoever registers one owns its shape — the app stores, merges and diffs it without
   * knowing what is in it.
   *
   * Called the first time the defaults are read, so a pack whose defaults come from its compiled seeds can read
   * them then rather than at registration.
   */
  settingsSections?: () => Record<string, unknown>;
}
