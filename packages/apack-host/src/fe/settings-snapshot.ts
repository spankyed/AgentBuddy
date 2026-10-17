import { _settingsJsonProblems, type SettingsCatalog } from '@apackdev/sdk/framework';
import { FEATURE_ID_PATTERN, PACK_ID_PATTERN, splitRef } from '@apackdev/sdk/ids';
import { hasOwn, isPlainObject } from '@apackdev/sdk/utils/pure';
import type { SettingsSnapshot } from '@apackdev/sdk/types';
import { isEqual } from '../features/settings/document.ts';
import { compileSettingsCatalog } from '../features/settings/validation.ts';

const revision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Validate each wire snapshot; compile declarations only when their identity changes. */
export function createSettingsSnapshotReader() {
  let compiled: { runId: string; catalog: SettingsCatalog; validator: ReturnType<typeof compileSettingsCatalog> } | undefined;
  return (value: unknown, previous?: SettingsSnapshot): SettingsSnapshot => {
    if (_settingsJsonProblems(value).length || !isPlainObject(value)
      || typeof value.runId !== 'string' || !value.runId || !revision(value.revision)
      || !['ready', 'replacing'].includes(value.status as string)) throw new Error('Invalid settings snapshot');
    const catalog = value.catalog;
    if (!isPlainObject(catalog) || !revision(catalog.revision) || !isPlainObject(catalog.packs)
      || !isPlainObject(catalog.features) || !isPlainObject(catalog.dependencies)) throw new Error('Invalid settings catalog');
    for (const [id, dependencies] of Object.entries(catalog.dependencies)) {
      if (!PACK_ID_PATTERN.test(id) || !Array.isArray(dependencies)
        || dependencies.some(dependency => typeof dependency !== 'string' || !PACK_ID_PATTERN.test(dependency))) {
        throw new Error('Invalid settings dependencies');
      }
    }
    for (const [packId, groups] of Object.entries(catalog.packs)) {
      if (!PACK_ID_PATTERN.test(packId) || !hasOwn(catalog.dependencies, packId) || !isPlainObject(groups)
        || Object.keys(groups).some(groupId => !FEATURE_ID_PATTERN.test(groupId))) throw new Error('Invalid pack settings catalog');
    }
    for (const ref of Object.keys(catalog.features)) {
      const owner = splitRef(ref);
      if (!owner || !hasOwn(catalog.dependencies, owner.packId)) throw new Error('Invalid feature settings catalog');
    }
    const snapshot = structuredClone(value) as unknown as SettingsSnapshot;
    if (previous?.runId === snapshot.runId && previous.catalog.revision === snapshot.catalog.revision
      && !isEqual(previous.catalog, snapshot.catalog)) throw new Error('Settings declarations changed without a catalog revision');
    if (previous?.runId === snapshot.runId && previous.revision === snapshot.revision
      && previous.catalog.revision === snapshot.catalog.revision
      && (previous.status !== snapshot.status || !isEqual(previous.values, snapshot.values))) {
      throw new Error('Settings changed without a value or catalog revision');
    }
    const sameCatalog = compiled?.runId === snapshot.runId && compiled.catalog.revision === snapshot.catalog.revision
      && isEqual(compiled.catalog, snapshot.catalog);
    const validator = sameCatalog ? compiled!.validator : compileSettingsCatalog(snapshot.catalog);
    validator.validateEffective(snapshot.values);
    compiled = { runId: snapshot.runId, catalog: snapshot.catalog, validator };
    return snapshot;
  };
}
