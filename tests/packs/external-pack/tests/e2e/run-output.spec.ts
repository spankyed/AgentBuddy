import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@apackdev/testing';

test('keeps screenshots and reports in the pack work directory', async ({ app }) => {
  const root = process.env.PACK_DIR;
  if (!root) throw new Error('Run this fixture through apack pack test');
  const screenshot = await app.screenshot('run-output');
  const image = path.join(root, '.apack/tests/screenshots/run-output.png');
  expect(fs.readFileSync(image)).toEqual(screenshot);
  expect([...screenshot.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  const report = await app.report('run-output', { ready: true });
  expect(report).toBe(path.join(root, '.apack/drive/results/run-output.json'));
  expect(JSON.parse(fs.readFileSync(report, 'utf8'))).toEqual({ ready: true });
});
