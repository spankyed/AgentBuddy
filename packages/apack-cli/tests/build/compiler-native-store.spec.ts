import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compilerNativeStore, storeCompilerNativePackage } from '../../src/build/compiler-native-store.ts';

let directory: string;
let store: string;

beforeEach(() => {
  directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-native-store-')));
  store = compilerNativeStore(path.join(directory, 'compilers', '0123456789abcdef'));
});

afterEach(() => {
  const writable = (file: string) => {
    if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isDirectory()) return;
    fs.chmodSync(file, 0o700);
    for (const name of fs.readdirSync(file)) writable(path.join(file, name));
  };
  writable(directory);
  fs.rmSync(directory, { recursive: true, force: true });
});

/** A materialized package: an executable addon and a manifest, as a build's read tree holds one */
function materialize(name: string, addon = 'addon bytes'): string {
  const root = path.join(directory, name);
  fs.mkdirSync(path.join(root, 'build', 'Release'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"native"}');
  fs.writeFileSync(path.join(root, 'build', 'Release', 'native.node'), addon);
  fs.chmodSync(path.join(root, 'build', 'Release', 'native.node'), 0o755);
  return root;
}

describe('storeCompilerNativePackage', () => {
  it('gives two builds holding the same bytes one stored path', () => {
    const first = storeCompilerNativePackage(materialize('one'), store);
    const second = storeCompilerNativePackage(materialize('two'), store);

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(path.dirname(first!)).toBe(fs.realpathSync(store));
    expect(fs.readFileSync(path.join(first!, 'build', 'Release', 'native.node'), 'utf8')).toBe('addon bytes');
    expect(fs.readdirSync(store)).toEqual([path.basename(first!)]);
  });

  it('gives different bytes a different path', () => {
    const first = storeCompilerNativePackage(materialize('one'), store);
    const second = storeCompilerNativePackage(materialize('two', 'other addon bytes'), store);

    expect(second).not.toBe(first);
  });

  it('keeps executable bits and stores the copy read-only', () => {
    const stored = storeCompilerNativePackage(materialize('one'), store)!;
    const addon = path.join(stored, 'build', 'Release', 'native.node');

    expect(fs.statSync(addon).mode & 0o777).toBe(0o555);
    expect(fs.statSync(path.join(stored, 'package.json')).mode & 0o777).toBe(0o444);
    expect(() => fs.writeFileSync(addon, 'changed')).toThrow();
  });

  it('replaces an entry whose bytes no longer match', () => {
    const stored = storeCompilerNativePackage(materialize('one'), store)!;
    const addon = path.join(stored, 'build', 'Release', 'native.node');
    fs.chmodSync(addon, 0o755);
    fs.writeFileSync(addon, 'damaged');

    expect(storeCompilerNativePackage(materialize('two'), store)).toBe(stored);
    expect(fs.readFileSync(addon, 'utf8')).toBe('addon bytes');
  });

  it.skipIf(process.platform === 'win32')('keeps a link inside the package as a relative link', () => {
    const root = materialize('one');
    fs.symlinkSync(path.join(root, 'build', 'Release', 'native.node'), path.join(root, 'current.node'));

    const stored = storeCompilerNativePackage(root, store)!;

    expect(fs.readlinkSync(path.join(stored, 'current.node'))).toBe(path.join('build', 'Release', 'native.node'));
    expect(fs.readFileSync(path.join(stored, 'current.node'), 'utf8')).toBe('addon bytes');
  });

  it.skipIf(process.platform === 'win32')('leaves a package with a link out of itself to the build', () => {
    const root = materialize('one');
    fs.writeFileSync(path.join(directory, 'outside.dylib'), 'outside');
    fs.symlinkSync(path.join(directory, 'outside.dylib'), path.join(root, 'outside.dylib'));

    expect(storeCompilerNativePackage(root, store)).toBeUndefined();
    expect(fs.existsSync(store) ? fs.readdirSync(store) : []).toEqual([]);
  });
});
