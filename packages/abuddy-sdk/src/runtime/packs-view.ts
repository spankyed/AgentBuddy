// What the registered packs contributed, as the SDK reads it. The app that registers them owns the data (host's
// createPackRegistry and createFePackRegistry) and binds read-only views: HostRuntime.packs in a backend process,
// FeHostRuntime.packs (FePackRegistryView, fe-host.ts) in the renderer.
import type { StepDefinition } from '../steps/types.ts';
import type { ArtifactDefinition } from '../artifacts/types.ts';
import type { BlockDefinition } from '../blocks/types.ts';
import type { SeedHooks } from '../seed/hooks.ts';
import type { Seeder } from '../utils/seed.ts';
import type { PackSettingsDefaults } from '../framework/pack-settings.ts';
import type { PackCommand } from '../framework/pack-commands.ts';

/** Entity types and relation kinds by the name they're declared under (`abuddy.json` `entities`, `relKinds`) */
export interface EarsNames {
  entities: Record<string, string>;
  relKinds: Record<string, string>;
}
import { _isHostBound, boundHost } from './host-runtime.ts';
import { _isFeHostBound, boundFeHost } from './fe-host.ts';

/** What backend and frontend code both look up in the registered packs */
export interface PackExtensionsView {
  /** The id of the system (backend) or plugin (frontend) that plays a role */
  designation(role: string): string | undefined;
  step(type: string): StepDefinition | undefined;
  /** Every registered step definition, in registration order */
  steps(): StepDefinition[];
  artifact(type: string): ArtifactDefinition | undefined;
  artifacts(): ArtifactDefinition[];
  block(type: string): BlockDefinition | undefined;
  blocks(): BlockDefinition[];
}

/** The registered packs, read-only: what the SDK looks up in them in a backend process */
export interface PackRegistryView extends PackExtensionsView {
  /** Every registered pack's services, by name */
  getRegisteredServices(): Record<string, unknown>;
  /** The id of the running system a `<packId>/<featureId>` name addresses, if any */
  resolveSystemAddress(address: string): string | undefined;
  /** The seed hooks registered for an entity type */
  seedHooks(entity: string): SeedHooks | undefined;
  /** A registered pack's seeders */
  seeders(packId: string): readonly Seeder[];
  /** Every registered pack's feature settings, merged */
  settingsDefaults(): PackSettingsDefaults;
  /** Calls `listener` whenever the feature settings defaults change; returns the unsubscribe */
  onSettingsDefaultsChanged(listener: () => void): () => void;
  /** Every registered pack's declared commands, in the order the packs were first registered */
  commands(): PackCommand[];
  /** The app's own entity types and relation kinds and every registered pack's, by the name each declares them under */
  earsNames(): EarsNames;
}

/**
 * @internal The registered packs' extensions: the frontend's in the renderer, the backend's elsewhere. Throws,
 * naming bindHost and bindFeHost, when neither is bound.
 */
export function _boundPackExtensions(): PackExtensionsView {
  if (_isFeHostBound()) return boundFeHost().packs;
  if (_isHostBound()) return boundHost().packs;
  throw new Error(
    'No host is bound, so no registered packs to look up: the app binds one at boot with bindHost(runtime) from '
    + '@abuddy/sdk/runtime (the renderer with bindFeHost(runtime)), and unit tests with startTestRuntime() from @abuddy/sdk/testing',
  );
}
