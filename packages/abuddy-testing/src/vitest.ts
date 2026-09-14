// Vitest helpers for suites that touch AgentBuddy's on-disk stores (EARS, media): an isolated data
// dir per run, split per worker so parallel spec files don't share stores, removed after the run.
//
//   import { isolatedDataDir } from '@abuddy/testing/vitest';
//   const dataDir = isolatedDataDir('my-pack-tests-');
//   export default defineConfig({ test: { env: dataDir.env, globalSetup: dataDir.globalSetup, setupFiles: [...dataDir.setupFiles, './tests/setup.ts'] } });
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface IsolatedDataDir {
  /** The run's data dir; each worker uses a `worker-<n>` subdir of it */
  dir: string;
  /** `test.env`: the test environment and the run's data dir */
  env: { ABUDDY_ENV: 'test'; ABUDDY_USER_DATA_DIR: string };
  /** `test.globalSetup`: removes the run's data dir when the run ends */
  globalSetup: string[];
  /** `test.setupFiles`, first: points the worker at its own subdir before anything opens a store */
  setupFiles: string[];
}

/** A sibling module of this one, with this module's extension (source .ts, or the bundle's .js) */
function sibling(name: string): string {
  const self = fileURLToPath(import.meta.url);
  return path.join(path.dirname(self), `${name}${path.extname(self)}`);
}

/** Creates the run's data dir and the vitest settings that isolate and clean it up */
export function isolatedDataDir(prefix = 'abuddy-tests-'): IsolatedDataDir {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    env: { ABUDDY_ENV: 'test', ABUDDY_USER_DATA_DIR: dir },
    globalSetup: [sibling('vitest-teardown')],
    setupFiles: [sibling('vitest-worker')],
  };
}
