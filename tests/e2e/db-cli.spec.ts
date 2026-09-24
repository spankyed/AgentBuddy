// abuddy db opens a data dir's database offline (docs/goals/goal-abuddy-db-cli.md, Decision 2 A): with the app running
// on it, a read works and warns that it may be stale, and a change is refused, so the app stays its only writer
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { test, expect } from './fixtures/app';

const CLI = path.resolve(import.meta.dirname, '../../packages/abuddy-cli/bin/abuddy.mjs');

function abuddyDb(args: string[]) {
  const result = spawnSync(process.execPath, [CLI, 'db', ...args], { encoding: 'utf-8', timeout: 60_000 });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
}

test("reads the running app's data and refuses to change it", async ({ electronApp, app }) => {
  // Connected: the API booted, hydrated and seeded the app's data
  await app.waitForState('running.connected');
  const dataDir = await electronApp.evaluate(({ app: electron }) => electron.getPath('userData'));

  const read = abuddyDb(['query', 'return [getEntitiesOfType(EARS.Entity.Settings).length > 0, qx(EARS.Entity.Flow).count() > 0]', '--data-dir', dataDir, '-o', 'json']);
  expect(read.stderr).toContain(`Database: ${dataDir} (offline)`);
  expect(read.stderr).toMatch(/Warning: AgentBuddy is running on it \(its process is running \(pid \d+\)\)/);
  expect(read.status, read.stderr).toBe(0);
  // The app's settings and seeded flows
  expect(JSON.parse(read.stdout)).toEqual([true, true]);

  const write = abuddyDb(['exec', "tx(EARS.Entity.Note).put('title', 'written while the app runs')", '--data-dir', dataDir]);
  expect(write.status).toBe(1);
  expect(write.stderr).toMatch(/AgentBuddy is running on .*: quit it first, this command changes its database/);
  const reset = abuddyDb(['reset', '--force', '--data-dir', dataDir]);
  expect(reset.status).toBe(1);
  expect(reset.stderr).toMatch(/quit it first/);

  const notes = abuddyDb(['query', "return qx(EARS.Entity.Note).pickAll().filter((note) => note.title === 'written while the app runs').length", '--data-dir', dataDir]);
  expect(notes.stdout).toBe('0');
});
