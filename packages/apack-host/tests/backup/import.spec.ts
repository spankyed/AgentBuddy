import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { untypedTx, type EARS } from '@apackdev/ears';
import { openEnvAt, closeEnv, type LmdbStore } from '@apackdev/ears/lmdb';
import { _appDataPaths } from '@apackdev/sdk/utils';
import { importDatabase } from '../../src/backup/index.ts';
import { openDatabaseStore } from '../../src/database/open.ts';
import { readInstalledSchema } from '../../src/database/schema.ts';
import { createSettingsBackupValidator } from '../../src/features/settings/be/backup.ts';
import { appSettingsDefinition } from '../../src/features/settings/be/app-definition.ts';
import { tempDir, removeTempDirs, schemaContext, writeData } from '../database/fixtures.ts';

const stores: LmdbStore[] = [];
const retained: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) store.close();
  for (const dir of retained.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  removeTempDirs();
});
const log = { info: () => {}, warn: () => {} };
const validate = createSettingsBackupValidator({ revision: 0, app: appSettingsDefinition, packs: {}, features: {}, dependencies: {} });
async function fixture(settings: unknown = {}) {
  const source = tempDir('settings-backup-source-');
  await writeData(source, () => {
    untypedTx('Settings-app' as EARS.EntityId, true).put('entityType', 'Settings').put('data', settings);
  });
  const backup = tempDir('settings-backup-candidate-');
  fs.cpSync(_appDataPaths(source).lmdb, path.join(backup, 'lmdb'), { recursive: true });
  fs.writeFileSync(path.join(backup, 'metadata.json'), JSON.stringify({ databases: ['lmdb'] }));
  const original = openEnvAt(path.join(backup, 'lmdb'));
  original.entities.putSync('Note-candidate', { type: 'Note' });
  closeEnv(original, () => {});
  fs.mkdirSync(path.join(backup, 'media'));
  fs.writeFileSync(path.join(backup, 'media', 'asset.txt'), 'candidate');
  const current = tempDir('settings-backup-current-');
  const paths = _appDataPaths(current);
  const { store } = openDatabaseStore({
    paths: { primary: paths.lmdb, volatileBackup: paths.volatileLmdb },
    schema: readInstalledSchema(schemaContext(current)), log: () => {},
  });
  stores.push(store);
  store.envs.primary.entities.putSync('Note-current', { type: 'Note' });
  return { backup, store, media: paths.media };
}

it('refuses invalid settings before entering replacement or closing the live database', async () => {
  const { backup, store, media } = await fixture({ app: { projects: 'invalid' } });
  const replace = vi.fn();
  const close = vi.spyOn(store, 'close');
  await expect(importDatabase(store, backup, media, { validate, log, withReplacement: replace })).rejects.toThrow();
  expect(replace).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(store.envs.primary.entities.get('Note-current')).toEqual({ type: 'Note' });
});

it('installs the validated copy even when the original backup is removed after preflight', async () => {
  const { backup, store, media } = await fixture();
  await importDatabase(store, backup, media, { validate, log, withReplacement: async replace => {
    fs.rmSync(backup, { recursive: true });
    return replace();
  } });
  expect(store.envs.primary.entities.get('Note-candidate')).toEqual({ type: 'Note' });
  expect(store.envs.primary.entities.get('Note-current')).toBeUndefined();
  expect(fs.readFileSync(path.join(media, 'asset.txt'), 'utf8')).toBe('candidate');
});

it('restores live data and absence of media when reopening the imported database fails', async () => {
  const { backup, store, media } = await fixture();
  vi.spyOn(store, 'reopen').mockImplementationOnce(() => { throw new Error('open failed'); });
  await expect(importDatabase(store, backup, media, { validate, log })).rejects.toThrow('open failed');
  expect(store.envs.primary.entities.get('Note-current')).toEqual({ type: 'Note' });
  expect(store.envs.primary.entities.get('Note-candidate')).toBeUndefined();
  expect(fs.existsSync(media)).toBe(false);
});

it('retains a readable rollback snapshot when restoration also fails', async () => {
  const { backup, store, media } = await fixture();
  const reopen = vi.spyOn(store, 'reopen').mockImplementation(() => { throw new Error('open failed'); });
  let failure: unknown;
  try { await importDatabase(store, backup, media, { validate, log }); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(AggregateError);
  const rollback = (failure as AggregateError).message.split('retained at ')[1];
  retained.push(path.dirname(rollback));
  const copy = openEnvAt(path.join(rollback, 'lmdb'), { readOnly: true });
  try { expect(copy.entities.get('Note-current')).toEqual({ type: 'Note' }); }
  finally { closeEnv(copy, () => {}); }
  reopen.mockRestore();
  store.reopen();
});
