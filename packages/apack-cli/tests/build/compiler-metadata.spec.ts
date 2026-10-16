import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspect, types } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { captureCompilerMetadata } from '../../src/build/compiler-metadata.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-metadata-'));
  roots.push(root);
  const file = path.join(root, 'value.txt');
  fs.writeFileSync(file, 'ONE');
  return { root, file };
}

it('owns native Stats and validates consumed fields without depending on unused timestamps', () => {
  const { file } = fixture();
  const query = captureCompilerMetadata('stat', file, []);
  const stat = query.value() as fs.Stats;
  expect(stat).toBeInstanceOf(fs.Stats);
  expect(stat.size).toBe(3);
  expect(stat.isFile()).toBe(true);
  stat.size = 99;
  expect((query.value() as fs.Stats).size).toBe(3);
  fs.writeFileSync(file, 'DIFFERENT');
  expect((query.value() as fs.Stats).size).toBe(3);
  expect(query.assertCurrent()).toBe(false);
  fs.writeFileSync(file, 'ONE');
  expect(query.assertCurrent()).toBe(true);
});

it('preserves bigint fields and Date ownership', () => {
  const { file } = fixture();
  const bigint = captureCompilerMetadata('stat', file, [{ bigint: true }]);
  const stat = bigint.value() as fs.BigIntStats;
  expect(stat.size).toBe(3n);
  expect(stat.isFile()).toBe(true);
  const query = captureCompilerMetadata('stat', file, []);
  const first = query.value() as fs.Stats;
  const time = first.mtime.getTime();
  first.mtime.setTime(0);
  expect((query.value() as fs.Stats).mtime.getTime()).toBe(time);
  expect(query.assertCurrent()).toBe(true);
  expect(bigint.assertCurrent()).toBe(true);
});

it('owns symlink answers and negative queries and notices their changes', () => {
  const { root, file } = fixture();
  const link = path.join(root, 'link');
  fs.symlinkSync('value.txt', link);
  const query = captureCompilerMetadata('readlink', link, [{ encoding: 'buffer' }]);
  (query.value() as Buffer).fill(0);
  expect((query.value() as Buffer).toString()).toBe('value.txt');
  const missing = path.join(root, 'missing');
  const absent = captureCompilerMetadata('exists', missing, []);
  expect(absent.value()).toBe(false);
  fs.writeFileSync(missing, 'NEW');
  expect(absent.value()).toBe(false);
  expect(absent.assertCurrent()).toBe(false);
  fs.unlinkSync(link);
  fs.symlinkSync(path.basename(missing), link);
  expect((query.value() as Buffer).toString()).toBe(path.basename(file));
  expect(query.assertCurrent()).toBe(false);
});

it('retains native cloning, inspection and error brands', () => {
  const { root, file } = fixture();
  const query = captureCompilerMetadata('stat', file, []);
  const native = fs.statSync(file);
  expect(structuredClone(query.value())).toEqual(structuredClone(native));
  expect(inspect(query.value())).toBe(inspect(native));
  const absent = captureCompilerMetadata('stat', path.join(root, 'absent'), []);
  try { absent.value(); throw new Error('Missing stat succeeded'); }
  catch (error) {
    expect(error).toMatchObject({ code: 'ENOENT' });
    expect(types.isNativeError(error)).toBe(true);
    expect(structuredClone(error)).toBeInstanceOf(Error);
  }
  expect(query.assertCurrent()).toBe(true);
});
