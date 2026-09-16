// The database plugin's backup flow: an export or import is in progress from the request until the
// system reports how it ended, and the outcome is kept for the Backup & Restore view to report.
import { beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

const sendToSystem = vi.hoisted(() => vi.fn());
vi.mock('@/__generated__/events', () => ({ sendToSystem }));

const { default: databaseState } = await import('./state');

function backupView() {
  const actor = createActor(databaseState).start();
  actor.send({ type: 'VIEW_BACKUP' });
  return actor;
}

const backup = (actor: ReturnType<typeof backupView>) => {
  const { exporting, importing, backupResult } = actor.getSnapshot().context;
  return { exporting, importing, backupResult };
};

beforeEach(() => {
  sendToSystem.mockReset();
});

it('exports until the system reports success', () => {
  const actor = backupView();

  actor.send({ type: 'BACKUP.EXPORT', path: '/backups', databases: ['lmdb'] });
  expect(sendToSystem).toHaveBeenCalledWith('database', { type: 'EXPORT_DATABASE', path: '/backups', name: undefined, databases: ['lmdb'] });
  expect(backup(actor)).toEqual({ exporting: true, importing: false, backupResult: null });

  actor.send({ type: 'EXPORT_DATABASE_SUCCESS', path: '/backups/backup-1' });
  expect(backup(actor)).toEqual({ exporting: false, importing: false, backupResult: { operation: 'export', error: undefined } });
});

it('keeps an import failure, also after leaving the backup view', () => {
  const actor = backupView();

  actor.send({ type: 'BACKUP.IMPORT', path: '/backups/backup-1' });
  expect(sendToSystem).toHaveBeenCalledWith('database', { type: 'IMPORT_DATABASE', path: '/backups/backup-1' });
  expect(backup(actor).importing).toBe(true);
  actor.send({ type: 'BACK_TO_EXPLORER' });

  actor.send({ type: 'IMPORT_DATABASE_ERROR', error: 'no manifest' });
  expect(backup(actor)).toEqual({ exporting: false, importing: false, backupResult: { operation: 'import', error: 'no manifest' } });
});
