import { randomUUID } from 'node:crypto';
import { createLogger } from '@apackdev/sdk/logger';
// One host writer composes declarations beneath explicit choices for every preference owner.
import type { EarsQuery } from '@apackdev/ears';
import type { EARS } from '@apackdev/sdk';
import { _settingsJsonProblems, type SettingsCatalog, type SettingsDefinition } from '@apackdev/sdk/framework';
import { deepMerge, hasOwn, isPlainObject } from '@apackdev/sdk/utils/pure';
import { splitRef, PACK_ID_PATTERN, FEATURE_ID_PATTERN } from '@apackdev/sdk/ids';
import { settingsTargetPath, type SettingsDocument, type SettingsOverrides, type SettingsTarget, type SettingsSnapshot, type SettingsWriteCondition } from '@apackdev/sdk/types';
import type { SettingsChange } from '@apackdev/sdk/services';
import { getIn, isEqual, removeIn, SettingsRefusedError, setIn } from '../document.ts';
import { compileSettingsCatalog } from '../validation.ts';
export type { SettingsChange, SettingsDocument };

export const SETTINGS_ENTITY = 'Settings';
const SETTINGS_ID = `${SETTINGS_ENTITY}-app` as EARS.EntityId;
const logger = createLogger('settings');
export interface SettingsStoreOptions {
  /** The owning engine; test harnesses resolve the current engine after a reset. */
  ears: () => Pick<EarsQuery, 'qx' | 'tx'>;
  catalog: () => SettingsCatalog;
  /** Omit only for a fixed catalog, such as a one-shot validator. */
  onCatalogChanged?: (listener: () => void) => () => void;
}
export type SettingsStore = ReturnType<typeof createSettingsStore>;

export function createSettingsStore({ ears, catalog, onCatalogChanged }: SettingsStoreOptions) {
  const listeners = new Set<(change: SettingsChange) => void>();
  let replacingData = 0;
  let replacementSnapshot: Pick<SettingsSnapshot, 'values' | 'catalog'> | undefined;
  const runId = randomUUID();
  let revision = 0;
  let atRevision = -1;
  let validation: ReturnType<typeof compileSettingsCatalog>;

  function declarations(): SettingsCatalog {
    const definitions = catalog();
    if (definitions.revision !== atRevision) {
      validation = compileSettingsCatalog(definitions);
      atRevision = definitions.revision;
    }
    return definitions;
  }

  function defaults(): SettingsDocument { declarations(); return validation.defaults; }
  function stored(): SettingsOverrides {
    const row = ears().qx(SETTINGS_ID).pickOne(['data']);
    if (row === null) return {};
    if (!isPlainObject(row.data)) throw new SettingsRefusedError(['Stored settings must be a JSON object']);
    return structuredClone(row.data) as SettingsOverrides;
  }
  const effective = (): SettingsDocument => structuredClone(deepMerge(defaults(), stored())) as SettingsDocument;
  const tell = (change: SettingsChange) => {
    for (const listener of listeners) {
      try { listener(change); }
      catch (error) { logger.error('Settings subscriber failed', error instanceof Error ? error : new Error(String(error))); }
    }
  };
  function targetDefinition(target: SettingsTarget): SettingsDefinition | undefined {
    const definitions = declarations();
    if (!isPlainObject(target)) throw new SettingsRefusedError(['A settings target must identify its owner']);
    const keys = Object.keys(target);
    if (target.kind === 'app' && keys.length === 1) return definitions.app;
    if (target.kind === 'feature' && keys.length === 2 && typeof target.featureRef === 'string' && splitRef(target.featureRef)) {
      return hasOwn(definitions.features, target.featureRef) ? definitions.features[target.featureRef] : undefined;
    }
    if (target.kind === 'pack' && keys.length === 3 && typeof target.packId === 'string' && PACK_ID_PATTERN.test(target.packId)
      && typeof target.groupId === 'string' && FEATURE_ID_PATTERN.test(target.groupId)) {
      const groups = hasOwn(definitions.packs, target.packId) ? definitions.packs[target.packId] : undefined;
      return groups && hasOwn(groups, target.groupId) ? groups[target.groupId] : undefined;
    }
    throw new SettingsRefusedError(['A settings target must identify app, pack/group or feature ownership']);
  }

  function authorize(target: SettingsTarget, caller?: string, mutation = false): void {
    const definition = targetDefinition(target);
    if (!definition) throw new SettingsRefusedError(['This settings definition is unavailable']);
    if (caller === undefined) return; // Only host administration receives an unscoped writer.
    if (mutation && replacingData) throw new SettingsRefusedError(['Data is being replaced. Wait before changing settings.']);
    const { dependencies } = declarations();
    if (!hasOwn(dependencies, caller)) throw new SettingsRefusedError([`Settings caller "${caller}" is not declared`]);
    if (target.kind === 'app') return;
    const owner = target.kind === 'pack' ? target.packId : splitRef(target.featureRef)!.packId;
    if (caller !== owner && !dependencies[caller].includes(owner)) {
      throw new SettingsRefusedError([`Pack "${caller}" does not depend on settings owner "${owner}"`]);
    }
    if (mutation && caller !== owner && definition.access === 'owner') {
      throw new SettingsRefusedError([`Only pack "${owner}" may change these settings`]);
    }
  }

  function compare(condition: SettingsWriteCondition | undefined, value: unknown): void {
    if (condition === undefined) return;
    if (_settingsJsonProblems(condition).length || !isPlainObject(condition) || typeof condition.runId !== 'string' || !isPlainObject(condition.expected)
      || typeof condition.expected.exists !== 'boolean') throw new SettingsRefusedError(['Invalid settings write comparison']);
    if (condition.runId !== runId || condition.expected.exists !== (value !== undefined)
      || (condition.expected.exists && !isEqual(value, condition.expected.value))) {
      throw new SettingsRefusedError(['This setting changed since editing began. Review the current value before saving.']);
    }
  }

  function write(next: unknown): void {
    declarations();
    validation.validate(next, stored());
    const database = ears();
    const exists = database.qx(SETTINGS_ID).pickOne(['data']) !== null;
    (exists ? database.tx(SETTINGS_ID) : database.tx(SETTINGS_ID, true).put('entityType', SETTINGS_ENTITY))
      .put('data', structuredClone(next)).put('updatedAt', Date.now());
    revision++;
    tell('written');
  }

  function removeOverrides(path: readonly string[]): void {
    const before = stored();
    const next = removeIn(before, path);
    if (next !== before) write(next);
  }

  return {
    getAll: effective,
    getSnapshot(): SettingsSnapshot {
      const published = replacementSnapshot ?? { values: effective(), catalog: declarations() };
      return { runId, revision, status: replacingData ? 'replacing' : 'ready', ...structuredClone(published) };
    },
    getOverrides: stored,
    get<T = unknown>(target: SettingsTarget, caller?: string): T {
      authorize(target, caller);
      return getIn(effective(), settingsTargetPath(target)) as T;
    },
    set(target: SettingsTarget, path: readonly string[], value: unknown, caller?: string, condition?: SettingsWriteCondition): void {
      authorize(target, caller, true);
      if (!Array.isArray(path) || path.some(key => typeof key !== 'string')) throw new SettingsRefusedError(['Settings paths contain strings']);
      compare(condition, getIn(effective(), [...settingsTargetPath(target), ...path]));
      write(setIn(stored(), [...settingsTargetPath(target), ...path], value));
    },
    reset(target: SettingsTarget, caller?: string): void {
      // Host reset may remove an orphan; pack code requires a current authorized declaration.
      if (caller !== undefined) authorize(target, caller, true);
      else targetDefinition(target);
      removeOverrides(settingsTargetPath(target));
    },
    replaceAll(next: unknown, condition?: SettingsWriteCondition): void {
      compare(condition, effective());
      validation.validateEffective(next);
      write(next);
    },
    removeOverrides,
    resetAll: () => write({}),
    onChange(listener: (change: SettingsChange) => void): () => void {
      listeners.add(listener);
      const stopCatalog = onCatalogChanged?.(() => listener('written'));
      return () => { listeners.delete(listener); stopCatalog?.(); };
    },
    async whileReplacingData<T>(replace: () => Promise<T>): Promise<T> {
      // Database hydration bypasses the writer. Readers retain the published view until replacement settles.
      if (replacingData === 0) replacementSnapshot = { values: effective(), catalog: declarations() };
      if (replacingData++ === 0) { revision++; tell('replacing'); }
      try { return await replace(); }
      finally {
        if (--replacingData === 0) { replacementSnapshot = undefined; revision++; tell('replaced'); }
      }
    },
  };
}
