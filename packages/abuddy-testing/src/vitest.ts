// Vitest helpers for suites that touch AgentBuddy's on-disk stores (EARS, media): an isolated data
// dir per run, split per worker so parallel spec files don't share stores, removed after the run.
//
//   import { isolatedDataDir } from '@abuddy/testing/vitest';
//   const dataDir = isolatedDataDir('my-pack-tests-');
//   export default defineConfig({ test: { env: dataDir.env, globalSetup: dataDir.globalSetup, setupFiles: [...dataDir.setupFiles, './tests/setup.ts'] } });
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
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

/**
 * The resolve conditions for a pack's vitest config: `@abuddy/source` when the pack's @abuddy/sdk is
 * an AgentBuddy checkout (a linked pack, whose packages resolve to source), none when installed
 * (published packages have no source to resolve to). Same rule as abuddy build's.
 */
export function sourceConditions(packDir = process.cwd()): string[] {
  try {
    const manifest = createRequire(path.join(packDir, 'package.json')).resolve('@abuddy/sdk/package.json');
    return fs.realpathSync(manifest).split(path.sep).includes('node_modules') ? [] : ['@abuddy/source'];
  } catch {
    return [];
  }
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
