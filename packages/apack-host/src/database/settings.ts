import fs from 'node:fs';
import { _appDataPaths } from '@apackdev/sdk/utils';
import type { LmdbStore } from '@apackdev/ears/lmdb';
import { openDatabaseStore } from './open.ts';

/** Boot can inspect this one host-owned row before external packs are loaded or memory is hydrated. */
export function storedSettings(store: LmdbStore): unknown {
  const data = store.read().getAttr('Settings-app', 'data');
  return data === undefined ? {} : data;
}

/** Offline admission reads without hydrating or modifying the profile. The caller owns its storage lock. */
export function readSettingsOverrides(userDataDir: string): unknown {
  const paths = _appDataPaths(userDataDir);
  if (!fs.existsSync(paths.lmdb)) return {};
  const { store } = openDatabaseStore({
    path: paths.lmdb,
    schema: { getRegisteredEntityTypes: () => new Set(['Settings']), getRegisteredRelationKinds: () => new Set(), getRegisteredRoles: () => new Set() }, readOnly: true, log: () => {},
  });
  try { return storedSettings(store); }
  finally { store.close(); }
}
