import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { createCompilerNativeReports } from '../../src/build/compiler-native-reports.ts';
import { BUILD_INPUTS_DIRECTORY_ENV, createCompilerReadTree, removeCompilerReadTree } from '../../src/build/compiler-read-tree.ts';

it('reuses only the declared source module and refuses changed captured bytes', () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-native-report-')));
  const sourceRoot = path.join(root, 'pack'), workspace = path.join(root, 'workspace');
  fs.mkdirSync(sourceRoot); fs.mkdirSync(workspace);
  const file = path.join(sourceRoot, 'addon.node');
  fs.writeFileSync(file, 'OWNED');
  vi.stubEnv(BUILD_INPUTS_DIRECTORY_ENV, workspace);
  const tree = createCompilerReadTree({ files: [{ file, bytes: Buffer.from('OWNED'), mode: 0o644 }], locations: [], links: [] }, []);
  try {
    const module = { source: file, captured: tree.path(file), packageRoot: path.dirname(tree.path(file)) };
    const reports = createCompilerNativeReports(sourceRoot, workspace);
    reports.write({ source: { root: sourceRoot, entries: [] }, copies: tree.observations(), modules: [module] });
    expect(reports.findModule(file)).toEqual(module);
    expect(reports.findModule(path.join(root, 'other/addon.node'))).toBeUndefined();
    fs.chmodSync(module.captured, 0o644);
    fs.writeFileSync(module.captured, 'TAMPERED');
    expect(() => reports.findModule(file)).toThrow(/changed/i);
  } finally {
    tree.dispose(); vi.unstubAllEnvs(); removeCompilerReadTree(root);
  }
});

it.each(['source-owner', 'capture-escape', 'missing-copies', 'unobserved-module'] as const)('refuses an invalid native report: %s', invalid => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-native-report-')));
  try {
    const reports = createCompilerNativeReports(root, root);
    reports.write({ source: { root: invalid === 'source-owner' ? path.dirname(root) : root, entries: [] },
      copies: invalid === 'missing-copies' ? undefined : { root, entries: [] },
      modules: [{ source: path.join(root, 'source.node'), captured: path.join(invalid === 'capture-escape' ? path.dirname(root) : root, 'copy.node'), packageRoot: root }] });
    expect(() => reports.read()).toThrow('Cannot read compiler native inputs');
  } finally { removeCompilerReadTree(root); }
});
