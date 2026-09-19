// What the API's boot makes of what a killed process left in the data dir. Both shapes are settled before
// any pack loads — the write lock gates the store opening, and `prepareHostDataDirs` runs just after — and
// both are answered by a pid, which is why each carries a record of the boot it was written in.
//
// The unit tests for these live in @abuddy/host. This one boots the real composition, because what both
// regressions broke was the boot: one refused to start at all, the other deleted a pack on the way up.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-boot-recovery-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
const backend = await import('@/setup/backend');

/** A process id no process has any more */
function exitedPid(): number {
  return spawnSync(process.execPath, ['-e', '']).pid!;
}

const packsDir = path.join(dataDir, 'packs');
const stagingDir = `.demo-pack.previous-${exitedPid()}-a1b2c3d4`;

beforeAll(async () => {
  // A lock a killed `abuddy db` left behind, in the shape written before the machine field was renamed.
  // Its pid is gone, so nothing is changing the database.
  fs.writeFileSync(path.join(dataDir, 'db-write.lock'), JSON.stringify({
    pid: exitedPid(), host: os.hostname(), what: 'abuddy db import', since: new Date().toISOString(),
  }));

  // An install interrupted between moving the old copy aside and placing the new one: `demo-pack` is gone
  // and the moved-aside copy is the only one left. There is no installed-packs record, as a data dir
  // written by a version that kept that list elsewhere would have none.
  fs.mkdirSync(path.join(packsDir, stagingDir), { recursive: true });
  fs.writeFileSync(
    path.join(packsDir, stagingDir, 'abuddy.json'),
    JSON.stringify({ id: 'demo-pack', name: 'Demo Pack', version: '1.0.0' }),
  );

  await backend.setupBackend();
}, 120_000);

afterAll(() => {
  backend.backendActor?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('the API boot, on what a killed process left behind', () => {
  it('starts on a lock whose holder is gone, instead of refusing until someone deletes the file', () => {
    // It got past assertNoDatabaseWriter: the store that gate stands in front of is open
    expect(fs.existsSync(path.join(dataDir, '.data', 'ears-db'))).toBe(true);
  });

  it("restores an interrupted install's only copy, with no record to say the pack is still wanted", () => {
    expect(fs.existsSync(path.join(packsDir, 'demo-pack', 'abuddy.json'))).toBe(true);
    expect(fs.readdirSync(packsDir).filter((name) => name.startsWith('.demo-pack'))).toEqual([]);
  });
});
