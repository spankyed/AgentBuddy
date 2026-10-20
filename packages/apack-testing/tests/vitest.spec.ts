import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createPackCompilerInputView, assertNativeCompilerObservations } from '@apackdev/host/build/compiler-inputs';
import { definePackTestConfig } from '../src/vitest.ts';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

it('keeps runner cache writes outside recorded source and missing-dependency inputs', async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-runner-cache-')));
  directories.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"cache-fixture"}');
  fs.writeFileSync(path.join(root, 'source.ts'), 'export {};');
  const view = createPackCompilerInputView(root);
  try {
    view.captureLocation(root, 'entries');
    expect(view.fileSystem.directoryExists(path.join(root, 'node_modules'))).toBe(false);
    const observations = view.observations();
    const config = await definePackTestConfig({ dataDirPrefix: `apack-cache-config-${process.pid}-` });
    const dataDir = config.test?.env?.APACK_USER_DATA_DIR;
    if (typeof dataDir === 'string') directories.push(dataDir);
    // Vitest extends Vite's cacheDir with its own results subtree; its native default is node_modules/.vite.
    const cache = path.resolve(root, config.cacheDir ?? 'node_modules/.vite', 'vitest');
    fs.mkdirSync(cache, { recursive: true });
    fs.writeFileSync(path.join(cache, 'results.json'), '{}');
    expect(() => assertNativeCompilerObservations(observations)).not.toThrow();
    // A real dependency namespace appearing still invalidates the recorded negative lookup.
    fs.mkdirSync(path.join(root, 'node_modules'));
    expect(() => assertNativeCompilerObservations(observations)).toThrow(/input changed/);
    const dependencyProbe = observations.entries.filter(([query]) => query === '["namespace","node_modules"]');
    expect(dependencyProbe).toHaveLength(1);
    expect(() => assertNativeCompilerObservations({ root, entries: dependencyProbe })).toThrow(/namespace.*node_modules/);
  } finally { view.dispose(); }
});
