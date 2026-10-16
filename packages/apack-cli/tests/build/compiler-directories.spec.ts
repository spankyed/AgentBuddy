import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { openCapturedDirectory, readNativeDirectory } from '../../src/build/compiler-directories.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-native-directory-')));
  roots.push(root);
  const source = path.join(root, 'source'), copy = path.join(root, 'copy');
  fs.mkdirSync(source); fs.mkdirSync(copy);
  fs.writeFileSync(path.join(source, 'one.txt'), 'ONE');
  fs.writeFileSync(path.join(source, 'two.txt'), 'TWO');
  fs.mkdirSync(path.join(source, 'nested'));
  fs.writeFileSync(path.join(source, 'nested/three.txt'), 'THREE');
  fs.symlinkSync('one.txt', path.join(source, 'linked.txt'));
  return { source, copy };
}

it('keeps a native handle while sharing captured order across sync, callback, promise and iterator reads', async () => {
  const { source, copy } = fixture();
  const options = { bufferSize: 1, recursive: true };
  const entries = readNativeDirectory(source, options) as fs.Dirent[];
  const expected = entries.map(entry => [entry.parentPath, entry.name, entry.isSymbolicLink()]);
  const directory = openCapturedDirectory(copy, source, source, options, entries);
  expect(directory).toBeInstanceOf(fs.Dir);
  expect(directory.path).toBe(source);
  const results = [directory.readSync()!];
  results.push(await new Promise<fs.Dirent>((resolve, reject) => directory.read((error, entry) => error ? reject(error) : resolve(entry!))));
  results.push((await directory.read())!);
  for await (const entry of directory) results.push(entry);
  expect(results.map(entry => [entry.parentPath, entry.name, entry.isSymbolicLink()])).toEqual(expected);
  expect(() => directory.readSync()).toThrow(/closed/i);
  expect(() => directory.read()).toThrow(/closed/i);
});

it('preserves queued reads, native locking and caller-facing relative and Buffer paths', async () => {
  const { source, copy } = fixture();
  const relative = path.relative(process.cwd(), source);
  const entries = readNativeDirectory(source, {}) as fs.Dirent[];
  const expected = entries.map(entry => entry.name);
  const directory = openCapturedDirectory(copy, source, relative, {}, entries);
  try {
    const first = directory.read(), second = directory.read();
    expect(() => directory.readSync()).toThrow(/concurrent/i);
    expect((await Promise.all([first, second])).map(entry => entry?.name)).toEqual(expected.slice(0, 2));
    expect(directory.path).toBe(relative);
  } finally { await directory.close(); }
  const requested = Buffer.from(source);
  const buffered = openCapturedDirectory(copy, source, requested, { encoding: 'buffer' }, readNativeDirectory(source, { encoding: 'buffer' }));
  try {
    expect(buffered.path).toBe(requested);
    const entry = buffered.readSync()!;
    expect(Buffer.isBuffer(entry.name)).toBe(true);
    expect(Buffer.isBuffer(entry.parentPath)).toBe(true);
    expect(entry.parentPath.toString()).toBe(source);
  } finally { buffered.closeSync(); }
});
