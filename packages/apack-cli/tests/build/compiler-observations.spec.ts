import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createCompilerFileView } from '../../src/build/compiler-file-view.ts';
import { createCompilerInputObservations, hashCompilerInputObservations } from '../../src/build/compiler-observations.ts';
import { assertNativeCompilerObservations } from '../../src/build/compiler-observation-validation.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-observations-')));
  roots.push(root);
  const file = path.join(root, 'value.txt');
  fs.writeFileSync(file, 'ONE');
  return { root, file };
}

it('combines consumed stat fields and rejects conflicting reads after the source is restored', () => {
  const { root, file } = fixture();
  const first = createCompilerFileView(root), second = createCompilerFileView(root);
  expect((first.readMetadata('stat', file, []) as fs.Stats).size).toBe(3);
  expect((second.readMetadata('stat', file, []) as fs.Stats).isFile()).toBe(true);
  const a = first.observations(), b = structuredClone(second.observations());
  const merged = createCompilerInputObservations(root, [a, b]).snapshot();
  expect(() => assertNativeCompilerObservations(merged)).not.toThrow();
  expect(merged.entries).toHaveLength(4);
  expect(hashCompilerInputObservations(merged)).toBe(hashCompilerInputObservations(createCompilerInputObservations(root, [b, a]).snapshot()));
  fs.writeFileSync(file, 'DIFFERENT');
  const changed = createCompilerFileView(root);
  expect((changed.readMetadata('stat', file, []) as fs.Stats).size).toBe(9);
  expect(() => assertNativeCompilerObservations(merged)).toThrow(/startup input changed/);
  fs.writeFileSync(file, 'ONE');
  expect(() => first.assertCurrent()).not.toThrow();
  expect(() => createCompilerInputObservations(root, [a, changed.observations()])).toThrow(/Conflicting.*size/);
  expect(first.observations()).toEqual(a);
});

it('combines consumed directory prefixes and rejects an observed EOF versus a later entry', () => {
  const { root } = fixture();
  const first = createCompilerFileView(root), second = createCompilerFileView(root);
  try {
    expect(first.openDirectoryData(root, {}).read(0)?.name).toBe('value.txt');
    const cursor = second.openDirectoryData(root, {});
    expect(cursor.read(0)?.name).toBe('value.txt');
    expect(cursor.read(1)).toBeNull();
    const full = second.observations();
    expect(() => assertNativeCompilerObservations(full)).not.toThrow();
    expect(createCompilerInputObservations(root, [first.observations(), full]).snapshot()).toEqual(full);
    fs.writeFileSync(path.join(root, 'later.txt'), 'LATER');
    expect(() => assertNativeCompilerObservations(full)).toThrow(/startup input changed/);
    const changed = createCompilerFileView(root);
    try {
      const next = changed.openDirectoryData(root, {});
      for (let index = 0; next.read(index) !== null; index++);
      expect(() => createCompilerInputObservations(root, [full, changed.observations()])).toThrow('Conflicting compiler input observation');
    } finally { changed.dispose(); }
  } finally { first.dispose(); second.dispose(); }
});

it('projects captured paths consistently and transfers only owned serialized values', () => {
  const { root, file } = fixture();
  const copy = path.join(root, 'copy');
  fs.mkdirSync(copy);
  fs.copyFileSync(file, path.join(copy, 'value.txt'));
  const source = createCompilerFileView(root);
  const captured = createCompilerFileView(copy, { paths: [{ captured: copy, source: root }] });
  for (const [view, directory] of [[source, root], [captured, copy]] as const) {
    view.readBytes(path.join(directory, 'value.txt'));
    view.readMetadata('realpath', path.join(directory, 'value.txt'), [{ encoding: 'buffer' }]);
    expect(() => view.readMetadata('stat', path.join(directory, 'missing'), [])).toThrow();
  }
  const before = source.observations();
  expect(() => assertNativeCompilerObservations(before)).not.toThrow();
  expect(createCompilerInputObservations(root, [before, structuredClone(captured.observations())]).snapshot()).toEqual(before);
  expect(() => createCompilerInputObservations(copy, [before])).toThrow('roots differ');
  const mutable = before.entries as Array<[string, string]>;
  mutable[0]![1] = 'caller mutation';
  expect(source.observations()).not.toEqual(before);
});

it('replays buffered directory results, long cursor prefixes, bigint fields and native refusals', () => {
  const { root, file } = fixture();
  for (let index = 0; index < 12; index++) fs.writeFileSync(path.join(root, `entry-${index}`), 'DATA');
  const view = createCompilerFileView(root);
  try {
    view.readDirectoryData(root, { encoding: 'buffer', withFileTypes: true });
    const cursor = view.openDirectoryData(root, { encoding: 'buffer', bufferSize: 1 });
    for (let index = 0; cursor.read(index) !== null; index++);
    expect((view.readMetadata('stat', file, [{ bigint: true }]) as fs.BigIntStats).size).toBe(3n);
    expect(() => view.readMetadata('stat', path.join(root, 'missing'), [])).toThrow();
    expect(() => assertNativeCompilerObservations(view.observations())).not.toThrow();
  } finally { view.dispose(); }
});
