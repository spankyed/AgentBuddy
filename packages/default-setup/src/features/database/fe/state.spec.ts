// The database plugin's backup flow: an export or import is in progress from the request until the
// system reports how it ended, and the outcome is kept for the Backup & Restore view to report.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

const sendToSystem = vi.hoisted(() => vi.fn());
vi.mock('@/__generated__/events', () => ({ sendToSystem }));

const { default: databaseState } = await import('./state');

function backupView() {
  const actor = createActor(databaseState).start();
  actor.send({ type: 'VIEW_BACKUP' });
  return actor;
}

beforeEach(() => {
  sendToSystem.mockReset();
});

describe('database backup', () => {
  it('exports until the system reports success', () => {
    const actor = backupView();

    actor.send({ type: 'BACKUP.EXPORT', path: '/backups', databases: ['lmdb'] });
    expect(sendToSystem).toHaveBeenCalledWith('database', {
      type: 'EXPORT_DATABASE', path: '/backups', name: undefined, databases: ['lmdb'],
    });
    expect(actor.getSnapshot().context.backup).toEqual({ exporting: true, importing: false, result: null });

    actor.send({ type: 'BACKUP.EXPORT', path: '/backups', databases: ['lmdb'] });
    expect(sendToSystem).toHaveBeenCalledTimes(1);

    actor.send({ type: 'EXPORT_DATABASE_SUCCESS', path: '/backups/backup-1' });
    expect(actor.getSnapshot().context.backup).toEqual({
      exporting: false,
      importing: false,
      result: { operation: 'export', ok: true, message: '/backups/backup-1' },
    });
  });

  it('keeps an import failure', () => {
    const actor = backupView();

    actor.send({ type: 'BACKUP.IMPORT', path: '/backups/backup-1' });
    expect(sendToSystem).toHaveBeenCalledWith('database', { type: 'IMPORT_DATABASE', path: '/backups/backup-1' });
    expect(actor.getSnapshot().context.backup.importing).toBe(true);

    actor.send({ type: 'IMPORT_DATABASE_ERROR', error: 'no manifest' });
    expect(actor.getSnapshot().context.backup).toEqual({
      exporting: false,
      importing: false,
      result: { operation: 'import', ok: false, error: 'no manifest' },
    });
  });

  it('records the outcome after leaving the backup view', () => {
    const actor = backupView();
    actor.send({ type: 'BACKUP.IMPORT', path: '/backups/backup-1' });
    actor.send({ type: 'BACK_TO_EXPLORER' });

    actor.send({ type: 'IMPORT_DATABASE_SUCCESS', message: 'done' });
    expect(actor.getSnapshot().context.backup).toEqual({
      exporting: false,
      importing: false,
      result: { operation: 'import', ok: true, message: 'done' },
    });
  });
});
