import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi } from 'vitest';
import { openEnvAt, closeEnv } from '@apackdev/ears/lmdb';
import { readBackup } from '@apackdev/host/backup';
import { _appDataPaths } from '@apackdev/sdk/utils';
import { findDatabaseWriter } from '@apackdev/host/database';
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
    closeEnv(openEnvAt(paths.volatileLmdb), () => {});
    fs.mkdirSync(paths.media, { recursive: true });
    fs.writeFileSync(path.join(paths.media, 'asset.txt'), 'media');
    await db(['backup', '--data-dir', source, '--out', out], io);
    expect(readBackup(out)).toMatchObject({ databases: ['lmdb', 'volatileLmdb'], hasMedia: true });
    expect(fs.readFileSync(path.join(out, 'media/asset.txt'), 'utf8')).toBe('media');
    const copy = openEnvAt(path.join(out, 'lmdb'), { readOnly: true });
    expect(copy.entities.get('Note-a')).toEqual({ type: 'Note' });
    closeEnv(copy, () => {});
    expect(findDatabaseWriter(source)).toBeNull();
    await expect(db(['backup', '--data-dir', source, '--out', out], io)).rejects.toThrow('already exists');
    await expect(db(['backup', '--data-dir', source, '--out', path.join(source, 'nested')], io)).rejects.toThrow('outside');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
