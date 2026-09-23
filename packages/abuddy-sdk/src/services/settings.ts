/**
 * The app's settings, as pack code reaches them.
 *
 * Settings are the app's, not a pack's: the one row, its defaults and its one writer belong to the host, and a
 * feature reads or writes its own without depending on whichever pack renders the settings view.
 *
 * The document has one section the host knows — a feature's own settings, keyed by its ref — and whatever sections
 * the app registered beside it. What is stored is only what the user changed; what these read is the defaults with
 * those changes over them, so a changed default applies to every key the user never set.
 */

import type { FeatureRef } from '../ids/index.ts';

/**
 * An installed feature that can have settings, by its ref: one already resolved (`ref(name)`), or written out. Whoever calls, a bare name would be read as the calling
 * pack's, so the ref is required here and a bare one is a compile error before it is a runtime one.
 */
export type SettingsFeatureName = FeatureRef | `${string}/${string}`;

export interface SettingsService {
  /** Every setting in effect: each registered section, and each installed feature's own */
  getAll<T = Record<string, unknown>>(): T;

  /**
   * Only what the user changed, without the defaults merged in. What a migration rewrites — writing a merged copy
   * back would freeze today's defaults into the user's stored settings.
   */
  getStored<T = Record<string, unknown>>(): T;

  /** One registered section of the settings in effect, by the name whoever registered it gave */
  getSection<T = unknown>(section: string): T;

  /**
   * A feature's settings in effect. `name` must be an installed feature's ref; one that names no such feature
   * throws, naming the ref it likely meant.
   */
  forFeature<T = unknown>(name: SettingsFeatureName): T;

  /** Sets `value` at `path` in a feature's settings */
  setForFeature(name: SettingsFeatureName, path: readonly string[], value: unknown): void;

  /** Sets `value` at `path` in a registered section */
  setInSection(section: string, path: readonly string[], value: unknown): void;

  /**
   * Makes `settings` the settings in effect, keeping only what they change from the defaults. The one call that
   * carries arbitrary feature keys, so a slice that changes must be an installed feature's; one left as it was
   * stays, which is how an uninstalled pack's settings survive until it is reinstalled.
   */
  replaceAll(settings: unknown): void;

  /** Removes a stored value by its path in the stored data, so its default applies again */
  removeStored(path: readonly string[]): void;

  /** Forgets every change the user made, so the defaults apply again */
  reset(): void;

  /**
   * Runs `replace`, which replaces the app's stored data wholesale (a backup import), so that whoever is listening
   * to settings changes can tell the writes it makes from the user's. Told at the writer, so they cannot arrive out
   * of order with the writes they bracket, and told on a failure too — a failed import may have migrated some of
   * the data already.
   */
  whileReplacingData<T>(replace: () => Promise<T>): Promise<T>;

  /**
   * Calls `listener` on each change to the stored settings, whoever made it, and returns the unsubscribe. `written`
   * for a write; `replacing` and `replaced` bracket a wholesale replacement. Whoever tells features their settings
   * changed listens here, so a write made anywhere — a system, an action, a seed — reaches them.
   */
  onChange(listener: (change: SettingsChange) => void): () => void;
}

/** What happened to the stored settings: a write, or a wholesale replacement starting and ending */
export type SettingsChange = 'written' | 'replacing' | 'replaced';
