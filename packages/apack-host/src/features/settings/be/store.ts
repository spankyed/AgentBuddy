import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createLogger } from '@apackdev/sdk/logger';
// One host writer composes declarations beneath explicit choices for every preference owner.
import type { EarsQuery } from '@apackdev/ears';
import type { EARS } from '@apackdev/sdk';
import { _settingsJsonProblems, type SettingsCatalog } from '@apackdev/sdk/framework';
import { deepMerge, hasOwn, isPlainObject } from '@apackdev/sdk/utils/pure';
import { settingsTargetPath, type SettingsDocument, type SettingsOverrides, type SettingsTarget, type SettingsSnapshot, type SettingsProblem, type SettingsRecovery, type SettingsRecoveryRequest, type SettingsWriteCondition } from '@apackdev/sdk/types';
import type { SettingsChange } from '@apackdev/sdk/services';
import { authorizeSettings, settingsDefinition } from '../authorization.ts';
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
  let recovering = false;
  const replacement = new AsyncLocalStorage<{ active: boolean }>();
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
  function rawStored(): unknown {
    const row = ears().qx(SETTINGS_ID).pickOne(['data']);
    if (row === null) return {};
    return structuredClone(row.data);
  }
  function stored(): SettingsOverrides {
    const value = rawStored();
    if (!isPlainObject(value)) throw new SettingsRefusedError(['Stored settings must be a JSON object']);
    return value as SettingsOverrides;
  }
  function effective(): SettingsDocument {
    // Boot and catalog admission keep stored values valid; in recovery they are not, so nothing may read them typed.
    if (recovering) throw new SettingsRefusedError(['Settings require recovery. Reset the invalid values and restart.']);
    return structuredClone(deepMerge(defaults(), stored())) as SettingsDocument;
  }
  function getRecovery(): SettingsRecovery | undefined {
    if (!recovering) return undefined;
    declarations();
    return { version: { runId, revision }, problems: validation.inspect(rawStored()) };
  }
  /** The stored path to an invalid value, stopped at the first non-object: an array is replaced whole. */
  function storedPath(overrides: unknown, owner: readonly string[], path: readonly string[]): string[] {
    const found: string[] = [];
    let node = overrides;
    for (const key of [...owner, ...path]) {
      if (!isPlainObject(node) || !hasOwn(node, key)) break;
      found.push(key);
      node = node[key];
    }
    return found.length < owner.length ? [...owner] : found;
  }
  /** Removes each invalid value so its default applies; an owner that still fails is reset whole. */
  function withoutInvalid(overrides: unknown, problems: readonly SettingsProblem[]): unknown {
    let next = overrides;
    for (const { target, path } of problems) next = removeIn(next, storedPath(next, settingsTargetPath(target!), path));
    for (const { target } of validation.inspect(next)) if (target) next = removeIn(next, settingsTargetPath(target));
    return next;
  }
  const tell = (change: SettingsChange) => {
    for (const listener of listeners) {
      try { listener(change); }
      catch (error) { logger.error('Settings subscriber failed', error instanceof Error ? error : new Error(String(error))); }
    }
  };
  const targetDefinition = (target: SettingsTarget) => settingsDefinition(declarations(), target);
  function authorize(target: SettingsTarget, caller?: string, mutation = false): void {
    authorizeSettings(declarations(), target, caller, mutation);
    if (caller !== undefined && mutation && replacingData && !replacement.getStore()?.active) {
      throw new SettingsRefusedError(['Data is being replaced. Wait before changing settings.']);
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
    validation.validate(next, rawStored());
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
    enterRecovery: () => { recovering = true; },
    getRecovery,
    recover(request: SettingsRecoveryRequest): void {
      const current = getRecovery();
      if (!current?.problems.length || !isPlainObject(request) || _settingsJsonProblems(request).length || !isEqual(request.version, current.version)) {
        throw new SettingsRefusedError(['Settings changed. Review the current problems before resetting.']);
      }
      if (request.scope === 'all') { write({}); return; }
      if (request.scope !== 'invalid' || current.problems.some(problem => !problem.target)) {
        throw new SettingsRefusedError(['The preferences document is malformed. Reset all preferences to continue.']);
      }
      write(withoutInvalid(rawStored(), current.problems));
    },
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
      // Host-owned initialization/migrations may write; unrelated async callers still wait.
      const scope = { active: true };
      try { return await replacement.run(scope, replace); }
      finally {
        scope.active = false;
        if (--replacingData === 0) { replacementSnapshot = undefined; revision++; tell('replaced'); }
      }
    },
  };
}
