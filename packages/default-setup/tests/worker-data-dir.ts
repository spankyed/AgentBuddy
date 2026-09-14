// Each test worker gets its own data dir under the run's (vitest.config.ts), so specs in parallel
// workers don't share on-disk stores: a spec resetting the media store would delete another
// worker's seeded media mid-test. Runs before tests/setup.ts, which opens those stores.
import * as fs from 'node:fs';
import * as path from 'node:path';

const runDir = process.env.ABUDDY_USER_DATA_DIR;
if (runDir && process.env.VITEST_POOL_ID) {
  const workerDir = path.join(runDir, `worker-${process.env.VITEST_POOL_ID}`);
  fs.mkdirSync(workerDir, { recursive: true });
  process.env.ABUDDY_USER_DATA_DIR = workerDir;
}
