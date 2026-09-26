// The database plugin's backup flow: an export or import is in progress from the request until the
// system reports how it ended, and the outcome is kept for the Backup & Restore view to report.
import { beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

const sendToSystem = vi.hoisted(() => vi.fn());
vi.mock('@/__generated__/events', () => ({ sendToSystem }));

const { default: databaseState } = await import('@/features/database/fe/state');

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
  expect(backup(actor)).toEqual({ exporting: true, importing: false, backupResult: null });

  actor.send({ type: 'EXPORT_DATABASE_SUCCESS', path: '/backups/backup-1' });
  expect(backup(actor)).toEqual({ exporting: false, importing: false, backupResult: { operation: 'export', error: undefined } });
});

it('keeps an import failure, also after leaving the backup view', () => {
  const actor = backupView();

  actor.send({ type: 'BACKUP.IMPORT', path: '/backups/backup-1' });
  expect(backup(actor).importing).toBe(true);
  actor.send({ type: 'BACK_TO_EXPLORER' });

  actor.send({ type: 'IMPORT_DATABASE_ERROR', error: 'no manifest' });
  expect(backup(actor)).toEqual({ exporting: false, importing: false, backupResult: { operation: 'import', error: 'no manifest' } });
});

it("keeps the stores a newer AgentBuddy's backup holds, so the view can ask, and imports without them when told to", () => {
  const actor = backupView();

  actor.send({ type: 'BACKUP.IMPORT', path: '/backups/backup-1' });
  actor.send({ type: 'IMPORT_DATABASE_ERROR', error: 'a newer AgentBuddy made it', unknownDatabases: ['searchIndex'] });
  expect(backup(actor)).toEqual({
    exporting: false,
    importing: false,
    backupResult: { operation: 'import', error: 'a newer AgentBuddy made it', unknownDatabases: ['searchIndex'] },
  });

  // What the view sends once the user has said to import it anyway
  actor.send({ type: 'BACKUP.IMPORT', path: '/backups/backup-1', skipUnknownDatabases: true });
  expect(sendToSystem).toHaveBeenCalledWith('database', { type: 'IMPORT_DATABASE', path: '/backups/backup-1', skipUnknownDatabases: true });
});

// The Database settings' "Reset database" sends DATABASE.RESET to the plugin, whichever view it has open
it.each([
  ['the explorer', () => createActor(databaseState).start()],
  ['the backup view', backupView],
])('asks the system to reset the database from %s', (_, open) => {
  const actor = open();

  actor.send({ type: 'DATABASE.RESET' });

  expect(sendToSystem).toHaveBeenCalledWith('database', { type: 'RESET_DATABASE' });
});
