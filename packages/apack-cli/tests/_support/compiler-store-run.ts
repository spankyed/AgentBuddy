// One directory per test run for the workers' compiler stores (`compiler-store.ts`), removed when the run ends.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeCompilerStoreDirectory } from '../../src/build/compiler-installation.ts';

export default function setup(): () => Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-compiler-stores-'));
  process.env.APACK_TEST_COMPILER_STORES = root;
  return () => removeCompilerStoreDirectory(root);
}
