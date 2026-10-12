import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi } from 'vitest';
import { openEnvAt, closeEnv } from '@apackdev/ears/lmdb';
import { readBackup, importDatabase } from '@apackdev/host/backup';
import { resolveAppEnvironment } from '@apackdev/sdk/env';
import { _appDataPaths } from '@apackdev/sdk/utils';
import { findDatabaseWriter, publishRunningApp, openDatabaseStore, readInstalledSchema } from '@apackdev/host/database';
import { db } from '../../src/commands/db';

it('creates an importable backup with media and run history, and refuses overwrite and nested destinations', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-backup-'));
  const source = path.join(root, 'source');
  const out = path.join(root, 'backup');
  const io = { out: vi.fn(), err: vi.fn() };
  try {
    const paths = _appDataPaths(source);
    const primary = openEnvAt(paths.lmdb);
    primary.entities.putSync('Note-a', { type: 'Note' });
    closeEnv(primary, () => {});
    const history = openEnvAt(paths.volatileLmdb);
    history.entities.putSync('TNode-a', { type: 'TNode' });
    closeEnv(history, () => {});
    fs.mkdirSync(paths.media, { recursive: true });
    fs.writeFileSync(path.join(paths.media, 'asset.txt'), 'media');
    await db(['backup', '--data-dir', source, '--out', out], io);
    expect(fs.statSync(out).mode & 0o777).toBe(0o700);
    expect(readBackup(out)).toMatchObject({ databases: ['lmdb', 'volatileLmdb'], hasMedia: true });
    expect(fs.readFileSync(path.join(out, 'media/asset.txt'), 'utf8')).toBe('media');
    const copy = openEnvAt(path.join(out, 'lmdb'), { readOnly: true });
    expect(copy.entities.get('Note-a')).toEqual({ type: 'Note' });
    closeEnv(copy, () => {});
    await db(['backup', 'verify', out, '--json'], io);
    expect(JSON.parse(io.out.mock.lastCall![0])).toMatchObject({ valid: true, path: out });
    const restoreContext = resolveAppEnvironment({ env: 'production', userDataDir: path.join(root, 'restored') });
    const restored = _appDataPaths(restoreContext.userDataDir);
    const { store } = openDatabaseStore({
      paths: { primary: restored.lmdb, volatileBackup: restored.volatileLmdb },
      schema: readInstalledSchema(restoreContext), log: () => {},
    });
    try {
      await importDatabase(store, out, restored.media, { log: { info: () => {}, warn: () => {} } });
      expect(store.envs.primary.entities.get('Note-a')).toEqual({ type: 'Note' });
      expect(store.envs.volatileBackup.entities.get('TNode-a')).toEqual({ type: 'TNode' });
      expect(fs.readFileSync(path.join(restored.media, 'asset.txt'), 'utf8')).toBe('media');
    } finally { store.close(); }
    const running = publishRunningApp(source);
    try {
      await expect(db(['backup', '--data-dir', source, '--out', path.join(root, 'while-running')], io)).rejects.toThrow('Quit the app');
      expect(findDatabaseWriter(source)).toBeNull();
    } finally { running(); }
    const raced = path.join(root, 'raced');
    const racingIo = { out: vi.fn(), err: (message: string) => {
      if (message.startsWith('Backup completed:')) {
        fs.mkdirSync(raced);
        fs.writeFileSync(path.join(raced, 'keep'), 'other writer');
      }
    } };
    await expect(db(['backup', '--data-dir', source, '--out', raced], racingIo)).rejects.toThrow();
    expect(fs.readFileSync(path.join(raced, 'keep'), 'utf8')).toBe('other writer');
    expect(fs.readdirSync(root).filter(name => name.startsWith('.apack-backup-'))).toEqual([]);
    expect(findDatabaseWriter(source)).toBeNull();
    fs.renameSync(path.join(out, 'media'), path.join(out, 'lost-media'));
    await expect(db(['backup', 'verify', out], io)).rejects.toThrow('media directory is missing');
    fs.renameSync(path.join(out, 'lost-media'), path.join(out, 'media'));
    const metadataPath = path.join(out, 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    fs.writeFileSync(metadataPath, JSON.stringify({ ...metadata, includesMedia: false }));
    fs.renameSync(path.join(out, 'media'), path.join(out, 'saved-media'));
    fs.writeFileSync(path.join(out, 'media'), 'invalid media file');
    await expect(db(['backup', 'verify', out], io)).rejects.toThrow('not a directory');
    fs.rmSync(path.join(out, 'media'));
    fs.renameSync(path.join(out, 'saved-media'), path.join(out, 'media'));
    fs.writeFileSync(metadataPath, JSON.stringify(metadata));
    fs.rmSync(path.join(out, 'volatileLmdb'), { recursive: true });
    io.out.mockClear();
    await expect(db(['backup', 'verify', out, '--json'], io)).rejects.toThrow('Missing backup databases');
    expect(io.out).toHaveBeenCalledOnce();
    expect(JSON.parse(io.out.mock.lastCall![0])).toMatchObject({ valid: false, path: out, error: expect.stringContaining('Missing backup databases') });
    expect(findDatabaseWriter(source)).toBeNull();
    await expect(db(['backup', '--data-dir', source, '--out', out], io)).rejects.toThrow('already exists');
    await expect(db(['backup', '--data-dir', source, '--out', path.join(source, 'nested')], io)).rejects.toThrow('outside');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
