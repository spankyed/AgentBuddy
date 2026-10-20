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
    const alias = path.join(workspace, 'alias');
    fs.symlinkSync(module.packageRoot, alias, 'junction');
    const linked = { ...module, captured: path.join(alias, path.basename(module.captured)), packageRoot: alias };
    reports.write({ source: { root: sourceRoot, entries: [] }, copies: tree.observations(), modules: [linked] });
    expect(reports.findModule(file)).toEqual(linked);
    fs.chmodSync(module.captured, 0o644);
    fs.writeFileSync(module.captured, 'TAMPERED');
    expect(() => reports.findModule(file)).toThrow(/changed/i);
  } finally {
    tree.dispose(); vi.unstubAllEnvs(); removeCompilerReadTree(root);
  }
});

it('refuses a workspace alias whose physical target escapes the owned workspace', () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-native-report-')));
  try {
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(workspace);
    const outside = path.join(root, 'outside.node'), captured = path.join(workspace, 'copy.node');
    fs.writeFileSync(outside, 'OUTSIDE');
    fs.symlinkSync(outside, captured, 'file');
    const reports = createCompilerNativeReports(workspace, workspace);
    reports.write({ source: { root: workspace, entries: [] },
      copies: { root: workspace, entries: [[JSON.stringify(['file', 'copy.node']), JSON.stringify('0'.repeat(64))]] },
      modules: [{ source: path.join(workspace, 'source.node'), captured, packageRoot: workspace }] });
    expect(() => reports.read()).toThrow('Cannot read compiler native inputs');
  } finally { removeCompilerReadTree(root); }
});

it.each(['source-owner', 'capture-escape', 'missing-copies', 'unobserved-module'] as const)('refuses an invalid native report: %s', invalid => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-native-report-')));
  try {
    const reports = createCompilerNativeReports(root, root);
    fs.writeFileSync(path.join(root, 'copy.node'), 'UNOBSERVED');
    reports.write({ source: { root: invalid === 'source-owner' ? path.dirname(root) : root, entries: [] },
      copies: invalid === 'missing-copies' ? undefined : { root, entries: [] },
      modules: [{ source: path.join(root, 'source.node'), captured: path.join(invalid === 'capture-escape' ? path.dirname(root) : root, 'copy.node'), packageRoot: root }] });
    expect(() => reports.read()).toThrow('Cannot read compiler native inputs');
  } finally { removeCompilerReadTree(root); }
});
