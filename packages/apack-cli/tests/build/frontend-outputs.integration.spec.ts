import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createFrontendResourceFixture } from '../_support/frontend-resources.ts';
import { bundlePackFE } from '../../src/build/fe-bundler.ts';
import { createBuildOutputs } from '../../src/build/build-outputs.ts';

const fixture = createFrontendResourceFixture();
it('retains actual CSS, lazy, worker, map and public bytes for final candidate verification', async () => {
  const { pack } = fixture.consumer();
  for (const [file, bytes] of Object.entries({
    'src/output-entry.js': 'import "./proof.css"; export const lazy = () => import("./lazy.js"); export const worker = () => new Worker(new URL("./worker.js", import.meta.url), { type: "module" });',
    'src/lazy.js': 'export const value = "LAZY";',
    'src/worker.js': 'self.postMessage("WORKER");',
    'src/proof.css': '.proof { color: red; }',
    'public/nested/proof.txt': 'PUBLIC',
    'public/fe.js': '// placeholder replaced by the actual bundle',
  })) {
    fs.mkdirSync(path.dirname(path.join(pack, file)), { recursive: true });
    fs.writeFileSync(path.join(pack, file), bytes);
  }
  const outputDir = path.join(pack, 'dist/runtime');
  const outputs = createBuildOutputs(outputDir);
  const expected = new Map<string, string | Uint8Array>();
  const result = await bundlePackFE({ packDir: pack, entryPoint: path.join(pack, 'src/output-entry.js'), outputDir,
    recordOutput(file, bytes) { expected.set(path.relative(outputDir, file), bytes); outputs.record(file, bytes); } });
  expect(result.success, result.error).toBe(true);
  expect(() => outputs.assertCurrent()).not.toThrow();
  expect([...expected.keys()]).toEqual(expect.arrayContaining([
    'fe.js', 'fe.css', 'fe.js.map', 'nested/proof.txt',
    expect.stringMatching(/lazy.*\.js$/), expect.stringMatching(/worker.*\.js$/),
    expect.stringMatching(/lazy.*\.js\.map$/), expect.stringMatching(/worker.*\.js\.map$/),
  ]));
  for (const [file, bytes] of expected) {
    fs.unlinkSync(path.join(outputDir, file));
    expect(() => outputs.assertCurrent(), file).toThrow(/missing or changed/);
    fs.writeFileSync(path.join(outputDir, file), 'TAMPERED');
    expect(() => outputs.assertCurrent(), file).toThrow(/missing or changed/);
    fs.writeFileSync(path.join(outputDir, file), bytes);
  }
  expect(() => outputs.assertCurrent()).not.toThrow();
});
