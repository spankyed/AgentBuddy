import type { LmdbQuery } from '@apackdev/ears/lmdb';
import type { SettingsCatalog } from '@apackdev/sdk/framework';
import { compileSettingsCatalog } from '../validation.ts';

/** Validate copied preferences without installing an engine or changing live data. */
export function createSettingsBackupValidator(catalog: SettingsCatalog): (query: LmdbQuery) => void {
  const validation = compileSettingsCatalog(catalog);
  return query => validation.validate(query.getEntityMeta('Settings-app') ? query.getAttr('data', 'Settings-app') : {});
}
