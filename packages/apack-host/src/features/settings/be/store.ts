// The one Settings row, and the one writer to it. The app's settings are the host's: a feature reaches its own
// through `services.settings` and never through another pack.
//
// The row stores only what the user changed. The settings in effect are the defaults with those changes over them,
// so a changed default, or a pack's feature settings coming and going, applies to every key the user didn't set.
//
// App preferences and their schema/defaults belong to the host; feature schemas come from declarations.
// Pack sections remain transitional until pack-group handles replace them.
import { untypedTx, untypedQx } from '@apackdev/ears';
import type { EARS } from '@apackdev/sdk';
import { deepMerge, hasOwn } from '@apackdev/sdk/utils/pure';
import { refProblem, resolveName, type FeatureRef, type RefLookup } from '@apackdev/sdk/ids';
import { _compileSettingsDefinition, type SettingsValidator, type SettingsProblem, getFeaturesWithSettings, getPackSettingsDefaults } from '@apackdev/sdk/framework';
import { changesFrom, isEqual, FEATURES_SECTION, removeIn, SETTINGS_KIND, settingsProblems, SettingsRefusedError, setIn } from './document.ts';
// The contract's own, not a copy of it: `services.settings.onChange` and this store's must be the same type
import { appSettingsDefinition } from './app-definition.ts';
import type { SettingsChange } from '@apackdev/sdk/services';
export type { SettingsChange };

/** The entity type the host declares for the settings row */
export const SETTINGS_ENTITY = 'Settings';

// A fixed id without a hyphen: "Settings-app" with one had a bug where updates didn't persist
const SETTINGS_ID = `${SETTINGS_ENTITY}-app` as EARS.EntityId;

/** App preferences, feature slices and the currently registered pack sections. */
export interface SettingsDocument {
  [FEATURES_SECTION]: Record<string, unknown>;
  [section: string]: unknown;
}


export interface SettingsStoreOptions {
  /**
   * The settings in effect before the user changed anything: the registered sections with their defaults, and the
   * installed features' own under `features`. Read on each call, since a pack registering or unregistering changes it.
   */
  defaults: () => SettingsDocument;
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;

/** Own properties only: a settings path is data, including keys such as __proto__. */
function at(value: unknown, path: readonly (string | number)[]): unknown {
  for (const key of path) {
    if (value === null || typeof value !== 'object' || !hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** Retain only problems already present at an unchanged value, never a newly missing required field. */
function newProblems(validator: SettingsValidator, before: unknown, after: unknown): SettingsProblem[] {
  const previous = validator.validate(before);
  return validator.validate(after).filter(issue => issue.keyword === 'json'
    || !isEqual(at(before, issue.path), at(after, issue.path))
    || !previous.some(old => old.keyword === issue.keyword && old.message === issue.message && isEqual(old.path, issue.path)));
}

const appValidator = _compileSettingsDefinition(appSettingsDefinition);

export function createSettingsStore({ defaults: packDefaults }: SettingsStoreOptions) {
  // Pack registrations never supply or override the host's baseline.
  const defaults = (): SettingsDocument => ({ ...packDefaults(), app: structuredClone(appSettingsDefinition.defaults) });
  const listeners = new Set<(change: SettingsChange) => void>();
  /** How many data replacements are running (`whileReplacingData`) */
  let replacingData = 0;

  const tell = (change: SettingsChange): void => {
    for (const listener of listeners) listener(change);
  };

  /**
   * Only what the user changed. A read, and only a read: an app still at its defaults has changed nothing, so it has
   * no row, and asking what is stored must not be what creates one — `getAll()` runs wherever settings are read,
   * including against a database opened read-only.
   */
  function stored(): Partial<SettingsDocument> {
    const existing = untypedQx(SETTINGS_ID).pickOne(['data']) as { data?: unknown } | undefined;
    return (existing?.data ?? {}) as Partial<SettingsDocument>;
  }

  /** The settings in effect: the defaults with the stored changes over them */
  const effective = (): SettingsDocument => structuredClone(deepMerge(defaults(), stored())) as SettingsDocument;

  /** The sections a document may hold besides `features`, as the defaults name them */
  const sections = (): string[] => Object.keys(defaults()).filter((section) => section !== FEATURES_SECTION);

  /** How a feature's name is looked up: among the installed features with settings, a disabled pack's included */
  const lookup = (): RefLookup => ({ registered: getFeaturesWithSettings(), among: 'installed' });

  /**
   * Stores `next` as the user's changes and tells the listeners, once it passes `settingsProblems` against what is
   * stored: every write goes through here, so none stores a document of the wrong shape.
   */
  function write(next: unknown, removingSection?: string): void {
    const problems = settingsProblems(next, { before: stored(), sections: removingSection ? [...sections(), removingSection] : sections() });
    if (problems.length > 0) throw new SettingsRefusedError(problems);
    const current = effective();
    const effectiveNext = deepMerge(defaults(), next) as SettingsDocument;
    if (!isEqual(effectiveNext.app, current.app)) {
      for (const issue of newProblems(appValidator, current.app, effectiveNext.app)) {
        problems.push(`App ${issue.path.join('.') || 'settings'}: ${issue.message}`);
      }
    }
    const validators = getPackSettingsDefaults().validators;
    for (const [ref, slice] of Object.entries(effectiveNext.features ?? {})) {
      if (isEqual(slice, current.features?.[ref])) continue;
      const validator = validators[ref];
      if (!validator) {
        problems.push(`Feature "${ref}" does not declare a settings schema`);
        continue;
      }
      for (const issue of newProblems(validator, current.features?.[ref], slice)) {
        problems.push(`Feature "${ref}" ${issue.path.join('.') || 'settings'}: ${issue.message}`);
      }
    }

    if (problems.length > 0) throw new SettingsRefusedError(problems);
    // The first change is what creates the row, so it is written here rather than by whoever read the settings first.
    // treatAsNew gives it a createdAt, and the entity type is what makes it findable as a Settings row.
    const exists = untypedQx(SETTINGS_ID).pickOne(['data']) !== null;
    (exists ? untypedTx(SETTINGS_ID) : untypedTx(SETTINGS_ID, true).put('entityType', SETTINGS_ENTITY))
      .put('data', next as Partial<SettingsDocument>)
      .put('updatedAt', Date.now());
    tell('written');
  }

  return {
    /** The settings in effect */
    getAll: effective,

    /**
     * Only what the user changed, without the defaults merged in — what a migration has to rewrite, since writing a
     * merged copy back would freeze today's defaults into the user's stored settings.
     */
    getStored: stored,

    /** One section of the settings in effect, by the name whoever registered it gave */
    getSection: <T = unknown>(section: string): T => effective()[section] as T,

    /** A feature's settings in effect, by its ref */
    getFeatureSettings: <T = unknown>(feature: FeatureRef): T => (effective()[FEATURES_SECTION][feature] ?? {}) as T,

    /**
     * The ref of the installed feature with settings `name` stands for. Where a name arrives as a string — a client's
     * send, an action's `services.settings` call — it is parsed here once and throws naming the ref it likely meant,
     * so what the rest of the store takes is a `FeatureRef`.
     */
    featureRef(name: string): FeatureRef {
      const problem = refProblem(SETTINGS_KIND, name, lookup());
      if (problem) throw new SettingsRefusedError([problem]);
      return resolveName(name);
    },

    /** Sets `value` at `path` in a feature's settings, by its ref */
    setFeatureSetting(feature: FeatureRef, path: readonly string[], value: unknown): void {
      write(setIn(stored(), [FEATURES_SECTION, feature, ...path], value));
    },

    /** Sets `value` at `path` in a registered section */
    setSectionValue(section: string, path: readonly string[], value: unknown): void {
      write(setIn(stored(), [section, ...path], value));
    },

    /**
     * Makes `settings` the settings in effect: stores what they set that the defaults don't. A default they leave out
     * keeps applying, since stored settings only set values. This is the one edge that carries arbitrary feature
     * keys, so a changed slice must be an installed feature's.
     */
    replaceAll(settings: unknown): void {
      const among = lookup();
      const problems = settingsProblems(settings, {
        before: effective(),
        sections: sections(),
        keyProblem: (key) => refProblem(SETTINGS_KIND, key, among),
      });
      if (problems.length > 0) throw new SettingsRefusedError(problems);
      write(changesFrom(defaults(), settings) ?? {});
    },

    /** Removes a stored value (its path in the stored data), so its default applies again */
    removeStored(path: readonly string[]): void {
      const before = stored();
      const next = removeIn(before, path);
      // Reset may remove an orphan override even when its declaration is absent.
      if (next !== before) write(next, path[0]);
    },

    /** Forgets every change the user made, so the defaults apply again */
    reset: (): void => write({}),

    /**
     * Calls `listener` on each change to the stored settings, whoever made it; returns the unsubscribe. The settings
     * system tells each feature whose settings changed from here, so a write made anywhere (a system, an action, a
     * an apply) reaches the features it changed, and none is told a change twice. The changes arrive in the order they
     * happened, so a write a replacement makes can't be taken for one of its own.
     */
    onChange(listener: (change: SettingsChange) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Runs `replace`, which replaces the stored data wholesale (a backup import), telling the listeners it is running
     * and, once it settles, that it ended — done or failed, since a failed import may have migrated some of the data
     * already. The settings arrive past this writer, and the migrations the import runs write through it, so the
     * listeners can tell a write made in between from one of the user's. Said here, at the writer, they cannot arrive
     * out of order with the writes they bracket.
     */
    async whileReplacingData<T>(replace: () => Promise<T>): Promise<T> {
      if (replacingData++ === 0) tell('replacing');
      try {
        return await replace();
      } finally {
        if (--replacingData === 0) tell('replaced');
      }
    },
  };
}
