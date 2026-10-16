import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createPackCompilerInputView, type PackCompilerInputView } from '../../src/build/compiler-input-view.ts';

const roots: string[] = [];
const views: PackCompilerInputView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.dispose();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-authored-inputs-')));
  roots.push(root);
  const pack = path.join(root, 'pack');
  fs.mkdirSync(path.join(pack, 'empty'), { recursive: true });
  fs.mkdirSync(path.join(pack, 'src'));
  const source = path.join(pack, 'value.ts');
  fs.writeFileSync(source, 'export const value = 1;');
  return { root, pack, source };
}

it('owns authored bytes before their first compiler read, including linked files and binary assets', () => {
  const { root, pack, source } = fixture();
  const linked = path.join(root, 'linked.txt');
  fs.writeFileSync(linked, 'ORIGINAL');
  fs.symlinkSync(linked, path.join(pack, 'linked.txt'));
  const asset = path.join(pack, 'asset.bin');
  const bytes = Buffer.from([0, 255, 7]);
  fs.writeFileSync(asset, bytes);
  const view = createPackCompilerInputView(pack);
  views.push(view);
  fs.writeFileSync(source, 'export const value = 2;');
  fs.writeFileSync(linked, 'CHANGED');
  fs.writeFileSync(asset, 'CHANGED');
  expect(view.readBytes(source)?.toString()).toBe('export const value = 1;');
  expect(view.readDataBytes(linked)?.toString()).toBe('ORIGINAL');
  expect(view.readBytes(asset)).toEqual(bytes);
  expect(() => view.assertCurrent()).toThrow('Compiler resolution namespace changed');
  fs.writeFileSync(source, 'export const value = 1;');
  fs.writeFileSync(linked, 'ORIGINAL');
  fs.writeFileSync(asset, bytes);
  expect(() => view.assertCurrent()).not.toThrow();
  view.dispose();
  fs.rmSync(pack, { recursive: true });
  expect(() => view.assertCurrent()).toThrow(/outlived/);
});

it('retains authored membership and consumed directory queries while ignoring generated output', () => {
  const { pack } = fixture();
  fs.rmdirSync(path.join(pack, 'src'));
  const view = createPackCompilerInputView(pack);
  views.push(view);
  for (const directory of ['dist', '.apack', 'src/__generated__']) {
    fs.mkdirSync(path.join(pack, directory), { recursive: true });
    fs.writeFileSync(path.join(pack, directory, 'output.ts'), 'export {};');
  }
  expect(() => view.assertCurrent()).not.toThrow();
  view.fileSystem.getDirectories(path.join(pack, 'empty'));
  fs.mkdirSync(path.join(pack, 'empty/new-directory'));
  expect(() => view.assertCurrent()).toThrow('namespace changed');
  fs.rmdirSync(path.join(pack, 'empty/new-directory'));
  fs.writeFileSync(path.join(pack, 'new.ts'), 'export {};');
  expect(view.authoredFiles).toEqual(['value.ts']);
  expect(() => view.assertCurrent()).toThrow('source membership changed');
});
