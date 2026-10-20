import fs from 'node:fs';
import { _appDataPaths } from '@apackdev/sdk/utils';
import type { LmdbStore } from '@apackdev/ears/lmdb';
import { findAppDataPaths } from './layout.ts';
import { openDatabaseStore } from './open.ts';

/** Boot can inspect this one host-owned row before external packs are loaded or memory is hydrated. */
export function storedSettings(store: LmdbStore): unknown {
  const query = store.query('primary');
  return query.getAttrCount('data', 'Settings-app') || query.getEntityMeta('Settings-app')
    ? query.getFirstAttr('data', 'Settings-app') : {};
}

/** Offline admission reads without hydrating or modifying the profile. The caller owns its storage lock. */
export function readSettingsOverrides(userDataDir: string): unknown {
  const paths = _appDataPaths(userDataDir);
  if (!fs.existsSync(paths.lmdb) && !fs.existsSync(paths.volatileLmdb)) return {};
  findAppDataPaths(userDataDir);
  const { store } = openDatabaseStore({
    paths: { primary: paths.lmdb, volatileBackup: paths.volatileLmdb },
    schema: { getRegisteredEntityTypes: () => new Set(['Settings']) }, readOnly: true, log: () => {},
  });
  try { return storedSettings(store); }
  finally { store.close(); }
}
