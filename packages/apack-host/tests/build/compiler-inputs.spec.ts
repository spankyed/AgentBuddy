import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { createCompilerFileView, assertNativeCompilerObservations } from '../../src/build/compiler-inputs/index.ts';

it('attributes namespace refusals with recorded and replayed states', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-namespace-refusal-'));
  const file = path.join(root, 'added');
  const view = createCompilerFileView(root);
  try {
    view.captureDataLocation(file, 'file');
    const observations = view.observations();
    fs.mkdirSync(file);
    expect(() => assertNativeCompilerObservations(observations)).toThrow(/expected .*missing.*; observed .*directory/);
  } finally { view.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
});

it('keeps native, authored and extended root spellings in one input identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-root-spellings-'));
  const canonical = fs.realpathSync.native(root);
  fs.writeFileSync(path.join(root, 'value.txt'), 'VALUE');
  fs.mkdirSync(path.join(root, 'src/__generated__'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/__generated__/ignored.ts'), 'GENERATED');
  const views = [...new Set([root, canonical, path.toNamespacedPath(canonical)])].map(spelling => ({
    spelling, view: createCompilerFileView(spelling, { authoredFiles: ['value.txt'] }),
  }));
  try {
    for (const { spelling, view } of views) {
      expect(view.readBytes(path.join(spelling, 'value.txt'))?.toString()).toBe('VALUE');
      view.readMetadata('realpathNative', path.join(spelling, 'value.txt'), []);
      view.readDirectoryData(spelling, { withFileTypes: true });
      expect(view.fileSystem.fileExists(path.join(spelling, 'src/__generated__/ignored.ts'))).toBe(false);
      expect(view.observations().root).toBe(canonical);
    }
    const expected = views[0]!.view.observations().entries;
    for (const { view } of views) {
      expect(view.observations().entries).toEqual(expected);
      expect(() => assertNativeCompilerObservations(view.observations())).not.toThrow();
    }
  } finally {
    for (const { view } of views) view.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('preserves a root link and its metadata when replaying input facts', () => {
  const temporary = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-root-link-')));
  const root = path.join(temporary, 'pack'), replacement = path.join(temporary, 'replacement');
  const alias = path.join(temporary, 'linked-pack');
  for (const directory of [root, replacement]) {
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'value.txt'), 'VALUE');
  }
  fs.symlinkSync(root, alias, 'dir');
  const view = createCompilerFileView(alias, { authoredFiles: ['value.txt'] });
  try {
    expect((view.readMetadata('lstat', alias, []) as fs.Stats).isSymbolicLink()).toBe(true);
    view.readMetadata('readlink', alias, []);
    view.readDirectoryData(alias, { withFileTypes: true });
    view.readBytes(path.join(alias, 'value.txt'));
    const observations = view.observations();
    expect(() => assertNativeCompilerObservations(observations)).not.toThrow();
    fs.unlinkSync(alias);
    fs.symlinkSync(replacement, alias, 'dir');
    expect(() => view.assertCurrent()).toThrow(/changed/);
    expect(() => assertNativeCompilerObservations(observations)).toThrow(/changed/);
  } finally { view.dispose(); fs.rmSync(temporary, { recursive: true, force: true }); }
});

it('reports nested namespace probes for recursive native listings and consumed cursor entries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-recursive-probes-'));
  const nested = path.join(root, 'nested/empty');
  fs.mkdirSync(nested, { recursive: true });
  const observed = new Set<string>();
  const view = createCompilerFileView(root, { observe: (file, kind) => { if (kind === 'entries') observed.add(file); } });
  try {
    for (const options of [{ recursive: true }, { recursive: true, withFileTypes: true }]) {
      observed.clear();
      view.readDirectoryData(root, options);
      expect(observed.has(nested)).toBe(true);
    }
    observed.clear();
    const cursor = view.openDirectoryData(root, { recursive: true });
    for (let index = 0; cursor.read(index); index++) { /* consume the listing */ }
    expect(observed.has(nested)).toBe(true);
  } finally { view.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
});

it('keeps source directory observations current when a fresh build publishes output', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-source-directory-')));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/value.txt'), 'VALUE');
  const view = createCompilerFileView(root, { authoredFiles: ['src/value.txt'] });
  try {
    view.readDirectoryData(root, { withFileTypes: true });
    view.readDirectoryData(root, { recursive: true });
    const cursor = view.openDirectoryData(root, {});
    for (let index = 0; cursor.read(index); index++) { /* consume the source namespace */ }
    const observations = view.observations();
    for (const directory of ['dist', '.apack', '.git', 'src/__generated__']) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
      fs.writeFileSync(path.join(root, directory, 'output.txt'), 'OUTPUT');
    }
    expect(() => view.assertCurrent()).not.toThrow();
    expect(() => assertNativeCompilerObservations(observations)).not.toThrow();
    const names = view.readDirectoryData(path.join(root, '.apack'), undefined);
    expect(names).toEqual(['output.txt']);
    fs.writeFileSync(path.join(root, '.apack/late.txt'), 'LATE');
    expect(() => view.assertCurrent()).toThrow(/namespace changed/);
    expect(() => assertNativeCompilerObservations(observations)).not.toThrow();
    fs.writeFileSync(path.join(root, 'src/added.txt'), 'ADDED');
    expect(() => assertNativeCompilerObservations(observations)).toThrow(/input changed/);
  } finally { view.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
});

it('replays pack input facts without activating a compiler or installing filesystem interception', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-passive-inputs-'));
  const root = path.join(temporary, 'pack');
  fs.mkdirSync(root);
  const file = path.join(root, 'value.txt');
  fs.writeFileSync(file, 'ONE');
  const view = createCompilerFileView(root, { authoredFiles: ['value.txt'] });
  try {
    view.readBytes(file);
    expect((view.readMetadata('stat', file, []) as fs.Stats).size).toBe(3);
    const observations = path.join(temporary, 'observations.json');
    fs.writeFileSync(observations, JSON.stringify(view.observations()));
    const probe = `
      import fs from 'node:fs';
      import assert from 'node:assert/strict';
      import { registerHooks } from 'node:module';
      const read = fs.readFileSync, stat = fs.statSync;
      registerHooks({ resolve(specifier, context, next) {
        if (/^(typescript|vite|@apackdev\\/cli)(\\/|$)/.test(specifier)) {
          throw new Error('Compiler activation: ' + specifier);
        }
        return next(specifier, context);
      } });
      const { assertNativeCompilerObservations } = await import('@apackdev/host/build/compiler-inputs');
      assertNativeCompilerObservations(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')));
      assert.equal(fs.readFileSync, read);
      assert.equal(fs.statSync, stat);
    `;
    const result = spawnSync(process.execPath, ['--conditions=@apackdev/source', '--import', 'tsx',
      '--input-type=module', '-e', probe, observations], {
      cwd: path.resolve(import.meta.dirname, '../../../..'), encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, NODE_OPTIONS: undefined },
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  } finally {
    view.dispose();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
