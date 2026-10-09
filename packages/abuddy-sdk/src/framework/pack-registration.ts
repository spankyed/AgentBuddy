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

/**
 * The pack's boot hooks: code the app runs for it, and nothing else.
 *
 * **A registration carries code; the manifest and the compiled artifacts carry facts.** So nothing here
 * describes a pack's seeding: which keys it seeds is `seeds.json`'s, where its compiled seeds are follows
 * from where the pack is installed, and what a seed leaves alone the applier decides from the rows — an
 * unchanged hash, an edited row, one the user deleted. A fact put here is a second account of one of those.
 */
export interface PackBootHooks {
  onInit?: () => void;
  onShutdown?: () => void;
}

export interface PackEARS {
  entities: Record<string, string>;
  relKinds: Record<string, string>;
}

/** A feature's backend system, which the app runs at the feature's ref, `<packId>/<featureId>` */
export interface PackFeatureSystem {
  machine: AnyStateMachine;
  /** The event types it accepts: its machine's, and those abuddy.json `system.events.incoming` adds (`packSystem`) */
  receives: readonly string[];
}

/** What the backend knows of a feature's plugin: the event types it receives, which the app checks a send against */
export interface PackFeaturePlugin {
  /**
   * Generated from its own feature's system's outgoing events and every audience of the inbox the plugin's
   * `Contract` declares. One flat list: a passing check means the event's shape was accepted, not that this sender
   * was allowed to send it. `Message.from` is a label the generated sends stamp, not a claim the bus checks —
   * `docs/goals/wont-do/goal-sender-enforced-audiences.md` says why.
   */
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
  /** Content writers for the entity types this pack owns (abuddy.json `contentWriters`) */
  contentWriters?: Record<string, import('../content/writers.ts').ContentWriter>;
  /** The pack's appliers, one per seeded key (abuddy.json `content.sources`), which `importCompiledContent` runs for the pack's compiled seeds */
  appliers?: import('../utils/apply.ts').ContentApplier[];
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
