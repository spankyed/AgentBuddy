// One directory per test run, removed when the run ends, read-only trees included: the workers' compiler stores
// (`compiler-store.ts`) and anything a spec must keep past its own file, such as a cache a worker goes on writing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeCompilerStoreDirectory } from '../../src/build/compiler-installation.ts';

export default function setup(): () => Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-test-run-'));
  process.env.APACK_TEST_RUN_DIRECTORY = root;
  return () => removeCompilerStoreDirectory(root);
}
