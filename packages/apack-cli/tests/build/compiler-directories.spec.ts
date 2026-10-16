import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { captureNativeDirectory, openCapturedDirectory } from '../../src/build/compiler-directories.ts';

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

function readNativeDirectory(file: string, options: unknown) {
  const directory = Reflect.apply(fs.opendirSync, fs, [file, options]);
  const entries: fs.Dirent[] = [];
  try { for (let entry; (entry = directory.readSync()) !== null;) entries.push(entry); }
  finally { directory.closeSync(); }
  return entries;
}

it('keeps a native handle while sharing captured order across sync, callback, promise and iterator reads', async () => {
  const { source, copy } = fixture();
  const options = { bufferSize: 1, recursive: true };
  const entries = readNativeDirectory(source, options) as fs.Dirent[];
  const expected = entries.map(entry => [entry.parentPath, entry.name, entry.isSymbolicLink()]);
  const directory = openCapturedDirectory(copy, source, source, options, index => entries[index] ?? null);
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
  const directory = openCapturedDirectory(copy, source, relative, {}, index => entries[index] ?? null);
  try {
    const first = directory.read(), second = directory.read();
    expect(() => directory.readSync()).toThrow(/concurrent/i);
    expect((await Promise.all([first, second])).map(entry => entry?.name)).toEqual(expected.slice(0, 2));
    expect(directory.path).toBe(relative);
  } finally { await directory.close(); }
  const requested = Buffer.from(source);
  const values = readNativeDirectory(source, { encoding: 'buffer' });
  const buffered = openCapturedDirectory(copy, source, requested, { encoding: 'buffer' }, index => values[index] ?? null);
  try {
    expect(buffered.path).toBe(requested);
    const entry = buffered.readSync()!;
    expect(Buffer.isBuffer(entry.name)).toBe(true);
    expect(Buffer.isBuffer(entry.parentPath)).toBe(true);
    expect(entry.parentPath.toString()).toBe(source);
  } finally { buffered.closeSync(); }
});

it('captures only consumed entries and checks EOF only after it was observed', () => {
  const { source } = fixture();
  const expected = readNativeDirectory(source, { bufferSize: 1 });
  const cursor = captureNativeDirectory(source, { bufferSize: 1 });
  try {
    expect(cursor.assertCurrent()).toBe(true);
    const first = cursor.read(0)!;
    first.name = 'caller mutation';
    expect(cursor.read(0)!.name).toBe(expected[0]!.name);
    // Changing an unconsumed entry must not invalidate the consumed prefix.
    const last = expected.at(-1)!;
    fs.rmSync(path.join(last.parentPath, last.name), { recursive: true });
    expect(cursor.assertCurrent()).toBe(true);
    if (last.isDirectory()) fs.mkdirSync(path.join(last.parentPath, last.name));
    else if (last.isSymbolicLink()) fs.symlinkSync('one.txt', path.join(last.parentPath, last.name));
    else fs.writeFileSync(path.join(last.parentPath, last.name), 'RESTORED');
    for (let index = 1; cursor.read(index) !== null; index++);
    expect(cursor.assertCurrent()).toBe(true);
    fs.writeFileSync(path.join(source, 'later.txt'), 'LATER');
    expect(cursor.assertCurrent()).toBe(false);
  } finally { cursor.dispose(); }
  expect(() => cursor.read(0)).toThrow(/outlived/);
});

it('matches asynchronous native traversal and permits disposal of a partial cursor', async () => {
  const { source, copy } = fixture();
  const options = { recursive: true, bufferSize: 1 };
  const expected: string[] = [];
  for await (const entry of await fs.promises.opendir(source, options)) expected.push(path.join(entry.parentPath, entry.name));
  const cursor = captureNativeDirectory(source, options);
  try {
    const directory = openCapturedDirectory(copy, source, source, options, index => cursor.read(index));
    const actual: string[] = [];
    for await (const entry of directory) actual.push(path.join(entry.parentPath, entry.name));
    expect(actual).toEqual(expected);
    expect(cursor.assertCurrent()).toBe(true);
  } finally { cursor.dispose(); }
  const partial = captureNativeDirectory(source, options);
  partial.read(0);
  partial.dispose();
  partial.dispose();
  expect(() => partial.read(1)).toThrow(/outlived/);
});

it('defers native traversal errors until read and replays them through async handles', async () => {
  const { source, copy } = fixture();
  const options = { recursive: true, encoding: 'buffer', bufferSize: 1 };
  const native = Reflect.apply(fs.opendirSync, fs, [source, options]);
  let count = 0, failure: unknown;
  try { while (native.readSync()) count++; }
  catch (error) { failure = error; }
  finally { native.closeSync(); }
  expect(failure).toMatchObject({ code: 'ERR_INVALID_ARG_TYPE' });
  const unopened = captureNativeDirectory(source, options);
  unopened.dispose();
  const cursor = captureNativeDirectory(source, options);
  const directory = openCapturedDirectory(copy, source, source, options, index => cursor.read(index));
  try {
    for (let index = 0; index < count; index++) await directory.read();
    await expect(directory.read()).rejects.toMatchObject({ code: 'ERR_INVALID_ARG_TYPE' });
    expect(cursor.assertCurrent()).toBe(true);
  } finally { await directory.close(); cursor.dispose(); }
});
