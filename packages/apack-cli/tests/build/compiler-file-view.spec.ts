import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { createCompilerFileView } from '../../src/build/compiler-file-view.ts';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-compiler-view-')));
  roots.push(root);
  const file = path.join(root, 'source.ts');
  fs.writeFileSync(file, 'export const value = 1;');
  return { root, file, view: createCompilerFileView(root) };
}

it('serves one captured byte value through aliases and rejects changed live bytes without mutating its view', () => {
  const { root, file, view } = fixture();
  const alias = path.join(root, 'alias.ts');
  fs.symlinkSync(file, alias);
  const read = vi.spyOn(fs, 'readFileSync');
  const original = view.fileSystem.readFile(file);
  view.readBytes(file)!.fill(0);
  expect(view.fileSystem.readFile(file)).toBe(original);
  expect(() => view.captureFile(file, Buffer.from('different producer bytes'))).toThrow('changed during capture');
  expect(view.fileSystem.readFile(alias)).toBe(original);
  const hash = view.hash();
  fs.writeFileSync(file, 'export const value = 2;');
  expect(view.fileSystem.readFile(file)).toBe(original);
  expect(view.fileSystem.readFile(alias)).toBe(original);
  expect(read.mock.calls.filter(([input]) => input === file)).toHaveLength(1);
  expect(() => view.assertCurrent()).toThrow('changed during discovery');
  expect(view.fileSystem.readFile(file)).toBe(original);
  expect(createCompilerFileView(root).fileSystem.readFile(file)).toContain('value = 2');
  fs.writeFileSync(file, original!);
  expect(() => view.assertCurrent()).not.toThrow();
  expect(view.hash()).toBe(hash);
});

it('keeps a negative query negative and refuses its appearance until a new view is created', () => {
  const { root, view } = fixture();
  const future = path.join(root, 'future.ts');
  expect(view.fileSystem.fileExists(future)).toBe(false);
  fs.writeFileSync(future, 'export {};');
  expect(view.fileSystem.fileExists(future)).toBe(false);
  expect(view.fileSystem.readFile(future)).toBeUndefined();
  expect(() => view.assertCurrent()).toThrow('changed during discovery');
  expect(createCompilerFileView(root).fileSystem.fileExists(future)).toBe(true);
});

it('owns directory and glob results, including negative membership', () => {
  const { root, view } = fixture();
  fs.mkdirSync(path.join(root, 'first'));
  const dirs = view.fileSystem.getDirectories(root);
  const files = view.fileSystem.readDirectory(root, ['.ts']);
  dirs.push('injected');
  files.push(path.join(root, 'injected.ts'));
  fs.mkdirSync(path.join(root, 'second'));
  fs.writeFileSync(path.join(root, 'added.ts'), 'export {};');
  expect(view.fileSystem.getDirectories(root)).toEqual(['first']);
  expect(view.fileSystem.readDirectory(root, ['.ts'])).toEqual([path.join(root, 'source.ts')]);
  expect(() => view.assertCurrent()).toThrow('changed during discovery');
});

it('owns glob arguments as well as the returned list', () => {
  const { root, view } = fixture();
  const extensions = ['.ts'];
  expect(view.fileSystem.readDirectory(root, extensions)).toHaveLength(1);
  const hash = view.hash();
  extensions[0] = '.js';
  expect(view.hash()).toBe(hash);
  expect(() => view.assertCurrent()).not.toThrow();
});

it('owns the origin mappings used by its fingerprint', () => {
  const { root, file } = fixture();
  const mapping = { captured: root, source: root };
  const view = createCompilerFileView(root, { paths: [mapping] });
  view.fileSystem.readFile(file);
  const hash = view.hash();
  mapping.source = path.join(root, 'changed');
  expect(view.hash()).toBe(hash);
});

it('identifies a captured root by its source while reading and validating the captured files', () => {
  const { root, file } = fixture();
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-owned-view-')));
  roots.push(temporary);
  const captured = path.join(temporary, 'nested/tree/pack');
  fs.mkdirSync(captured, { recursive: true });
  const copied = path.join(captured, 'source.ts');
  fs.copyFileSync(file, copied);
  const source = createCompilerFileView(root);
  const snapshot = createCompilerFileView(captured, { paths: [{ captured, source: root }] });
  for (const [view, directory] of [[source, root], [snapshot, captured]] as const) {
    expect(view.fileSystem.readFile(path.join(directory, 'source.ts'))).toContain('value = 1');
    view.fileSystem.readDirectory(directory, ['.ts']);
  }
  expect(snapshot.hash()).toBe(source.hash());
  fs.unlinkSync(file);
  expect(() => snapshot.assertCurrent()).not.toThrow();
  expect(snapshot.fileSystem.readFile(copied)).toContain('value = 1');
  fs.writeFileSync(copied, 'export const value = 2;');
  expect(() => snapshot.assertCurrent()).toThrow('changed during discovery');
});

it.each(['file', 'parent'] as const)('pins %s link reads and refuses a new physical target', kind => {
  const { root, file, view } = fixture();
  const first = path.join(root, 'first'), second = path.join(root, 'second');
  fs.mkdirSync(first); fs.mkdirSync(second);
  fs.writeFileSync(path.join(first, 'source.ts'), 'export const value = "first";');
  fs.writeFileSync(path.join(second, 'source.ts'), 'export const value = "second";');
  const link = path.join(root, 'linked');
  const target = (directory: string) => kind === 'file' ? path.join(directory, 'source.ts') : directory;
  fs.symlinkSync(target(first), link, kind === 'file' ? 'file' : 'dir');
  const input = kind === 'file' ? link : path.join(link, path.basename(file));
  expect(view.fileSystem.readFile(input)).toContain('"first"');
  const physical = view.fileSystem.realpath(input);
  fs.unlinkSync(link);
  fs.symlinkSync(target(second), link, kind === 'file' ? 'file' : 'dir');
  expect(view.fileSystem.readFile(input)).toContain('"first"');
  expect(view.fileSystem.realpath(input)).toBe(physical);
  expect(() => view.assertCurrent()).toThrow('changed during discovery');
});

it.each(['utf8', 'utf8-bom', 'utf16le', 'utf16be'] as const)('matches TypeScript decoding and preserves byte identity for %s', encoding => {
  const { root, file } = fixture();
  const text = 'export const café = "λ";';
  const utf8 = Buffer.from(text);
  const encoded = encoding === 'utf8' ? utf8 : encoding === 'utf8-bom' ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8])
    : Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  if (encoding === 'utf16be') encoded.swap16();
  fs.writeFileSync(file, encoded);
  const view = createCompilerFileView(root);
  expect(view.fileSystem.readFile(file)).toBe(ts.sys.readFile(file));
  expect(view.fileSystem.readFile(file)).toBe(text);
  const hash = view.hash();
  fs.writeFileSync(file, encoding === 'utf8' ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8]) : utf8);
  expect(() => view.assertCurrent()).toThrow('changed during discovery');
  const next = createCompilerFileView(root);
  expect(next.fileSystem.readFile(file)).toBe(text);
  expect(next.hash()).not.toBe(hash);
});

it('makes disposal terminal for captured inputs and query identities', () => {
  const { file, view } = fixture();
  expect(view.readBytes(file)).toBeDefined();
  view.dispose();
  view.dispose();
  expect(() => view.readBytes(file)).toThrow(/outlived/);
  expect(() => view.readMetadata('exists', file, [])).toThrow(/outlived/);
  expect(() => view.snapshot()).toThrow(/outlived/);
  expect(() => view.hash()).toThrow(/outlived/);
  expect(() => view.assertCurrent()).toThrow(/outlived/);
});
