import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createBuildOutputs } from '../../src/build/build-outputs.ts';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
it('refuses missing, changed or escaped writer output and accepts byte restoration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-build-outputs-'));
  roots.push(root);
  const file = path.join(root, 'lazy.js');
  const outputs = createBuildOutputs(root);
  outputs.record(file, 'FIRST');
  expect(() => outputs.assertCurrent()).toThrow(/missing or changed/);
  fs.writeFileSync(file, 'OTHER');
  expect(() => outputs.assertCurrent()).toThrow(/missing or changed/);
  fs.writeFileSync(file, 'FIRST');
  expect(() => outputs.assertCurrent()).not.toThrow();
  outputs.record(file, 'OTHER');
  expect(() => outputs.assertCurrent()).toThrow(/missing or changed/);
  fs.writeFileSync(file, 'OTHER');
  expect(() => outputs.assertCurrent()).not.toThrow();
  expect(() => outputs.record(path.join(root, '../outside'), 'FIRST')).toThrow(/outside/);
});
