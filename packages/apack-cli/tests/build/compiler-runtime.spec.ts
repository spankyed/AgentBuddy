import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { readCompilerRuntimeInputs } from '../../src/build/compiler-runtime.ts';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-runtime-inputs-')));
  roots.push(root);
  const executable = path.join(root, 'MacOS/runtime');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, 'runtime', { mode: 0o755 });
  return { root, executable };
}

it('identifies runtime bytes independently of the capture location', () => {
  const first = fixture(), second = fixture();
  const captured = new Map<string, Buffer>();
  const read = readCompilerRuntimeInputs(first.executable, false, (file, bytes) => captured.set(file.source, bytes));
  expect(captured.get(first.executable)?.toString()).toBe('runtime');
  expect(readCompilerRuntimeInputs(second.executable, false).hash).toBe(read.hash);
  fs.writeFileSync(first.executable, 'replacement');
  expect(readCompilerRuntimeInputs(first.executable, false).hash).not.toBe(read.hash);
  fs.writeFileSync(first.executable, 'runtime');
  expect(readCompilerRuntimeInputs(first.executable, false).hash).toBe(read.hash);
});

it.skipIf(process.platform === 'win32')('tracks changes to POSIX runtime executable permissions', () => {
  const { executable } = fixture();
  const initial = readCompilerRuntimeInputs(executable, false).hash;
  fs.chmodSync(executable, 0o644);
  expect(readCompilerRuntimeInputs(executable, false).hash).not.toBe(initial);
});

it.skipIf(process.platform !== 'darwin')('includes Electron framework bytes, links and empty directory membership', () => {
  const { root, executable } = fixture();
  const framework = path.join(root, 'Frameworks/Runtime.framework');
  fs.mkdirSync(path.join(framework, 'Versions/A'), { recursive: true });
  fs.writeFileSync(path.join(framework, 'Versions/A/runtime'), 'library');
  fs.symlinkSync('A', path.join(framework, 'Versions/Current'));
  fs.symlinkSync('Versions/Current/runtime', path.join(framework, 'runtime'));
  const initial = readCompilerRuntimeInputs(executable, true);
  expect(initial.links).toHaveLength(2);
  fs.writeFileSync(path.join(framework, 'Versions/A/runtime'), 'changed');
  expect(readCompilerRuntimeInputs(executable, true).hash).not.toBe(initial.hash);
  fs.writeFileSync(path.join(framework, 'Versions/A/runtime'), 'library');
  expect(readCompilerRuntimeInputs(executable, true).hash).toBe(initial.hash);
  fs.mkdirSync(path.join(framework, 'empty'));
  expect(readCompilerRuntimeInputs(executable, true).hash).not.toBe(initial.hash);
});
