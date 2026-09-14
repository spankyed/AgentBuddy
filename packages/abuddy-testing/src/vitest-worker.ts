// A vitest setup file (isolatedDataDir().setupFiles): each worker gets its own data dir under the
// run's, so specs in parallel workers don't share on-disk stores. A spec resetting the media store
// would otherwise delete another worker's media mid-test. List it before setup files that open stores.
import * as fs from 'node:fs';
import * as path from 'node:path';

const runDir = process.env.ABUDDY_USER_DATA_DIR;
if (runDir && process.env.VITEST_POOL_ID) {
  const workerDir = path.join(runDir, `worker-${process.env.VITEST_POOL_ID}`);
  fs.mkdirSync(workerDir, { recursive: true });
  process.env.ABUDDY_USER_DATA_DIR = workerDir;
}
