/**
 * Pack Registration Types
 *
 * Contract that packs use to declare what they contribute to the host.
 * The host (API) owns the mutable registry; packs only reference these types.
 */

import type { AnyStateMachine } from 'xstate';

/** A versioned change: declared target/description with a checked executable function. */
export interface PackMigration {
  target: string;
  description: string;
  up: () => void;
}

/**
 * A pack's migrations, split by the version line their targets are on.
 *
 * **A bare version does not say what it is a version of**, which is the fact this shape supplies. The
 * alternative is a runner deciding from the pack's provenance — a pack the app ships compared against
 * apack's version, everyone else's against their own — under which the same `0.4.0` means two things
 * and a pack replacing a shipped one inherits the wrong line.
 */
export interface PackMigrations {
  /** Run against apack's version, for data whose shape follows the app rather than this pack */
  app?: PackMigration[];
  /** Run against this pack's own `version` */
  pack?: PackMigration[];
}

/**
 * The pack's lifecycle hooks: code the app runs for it, and nothing else.
 *
 * **A registration carries code; the manifest and the compiled builds carry facts.** So nothing here
 * describes a pack's content: which keys it writes is `content.json`'s, where its compiled content is follows
 * from where the pack is installed, and what an apply leaves alone the applier decides from the rows — an
 * unchanged hash, an edited row, one the user deleted. A fact put here is a second account of one of those.
 */
export interface PackLifecycleHooks {
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
  /** The event types it accepts: its machine's, and those apack.json `system.events.incoming` adds (`packSystem`) */
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
  /** The feature's default settings (apack.json `features.<id>.settings`) */
  settings?: import('./settings-definition.ts').SettingsDefinition;
}

export interface PackRegistration {
  id: string;
  /** Generated bindings identify their declaration data; trusted host registrations have no installed build. */
  declarationRevision?: string;
  /**
   * The pack's features by id. The app runs each at `<packId>/<featureId>` and derives the rest from here:
   * the systems it starts and the events each accepts, the plugins and what each receives, the roles.
   */
  features?: Record<string, PackFeature>;
  services?: Record<string, unknown>;
  /** Generated runtime service binding; the host supplies accepted caller authority and records its revocation. */
  bindSettings?: (settings: import('../services/settings.ts').SettingsService) => () => void;
  ears?: PackEARS;
  /** The pack's repositories by name (apack.json `features[].repositories`), registered with the app's engine */
  repositories?: Record<string, unknown>;
  lifecycle?: PackLifecycleHooks;
  /**
   * The pack's migrations by version line, mirroring `apack.json`'s two maps: `app` runs against
   * apack's version, `pack` against this pack's own. Nested rather than two sibling fields so one
   * concept stays one key — and because `appMigrations` is already the host's own list of them.
   */
  migrations?: PackMigrations;
  steps?: import('../steps/types.ts').StepDefinition[];
  artifacts?: import('../artifacts/types.ts').ArtifactDefinition[];
  blocks?: import('../blocks/types.ts').BlockDefinition[];
  /** Content writers for the entity types this pack owns (apack.json `contentWriters`) */
  contentWriters?: Record<string, import('../content/writers.ts').ContentWriter>;
  /** The pack's appliers, one per content key (apack.json `content.sources`), which `importCompiledContent` runs for the pack's compiled content */
  appliers?: import('../utils/apply.ts').ContentApplier[];
  /** Build-checked command identities from extensions.commands; discovery reads catalog declarations. */
  commands?: import('./pack-commands.ts').PackCommand[];
  /** Display name used for this pack's contributions. */
  name?: string;
  /** Pack-owned preference groups declared inline in extensions.settings. */
  dependencies?: Record<string, string>;
  settings?: Record<string, import('./settings-definition.ts').SettingsDefinition>;
}
