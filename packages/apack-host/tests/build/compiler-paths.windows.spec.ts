import { expect, it, vi } from 'vitest';

vi.mock('node:path', async original => {
  const path = await original<typeof import('node:path')>();
  return { ...path, default: path.win32 };
});

import { compilerSourcePath, relativeCompilerPath } from '../../src/build/compiler-inputs/compiler-paths.ts';
import path from 'node:path';

it('keeps extended private copies inside their DOS-spelled owner boundary', () => {
  expect(relativeCompilerPath('C:\\capture\\tree', '\\\\?\\C:\\capture\\tree\\repo\\package.json')).toBe('repo\\package.json');
  expect(relativeCompilerPath('\\\\?\\C:\\capture\\tree', 'C:\\capture\\tree\\repo\\package.json')).toBe('repo\\package.json');
});

it.each(['C:\\capture\\tree\\repo\\package.json', '\\\\?\\C:\\capture\\tree\\repo\\package.json'])(
  'projects Windows compiler copies to one source identity: %s', file => {
    expect(compilerSourcePath(file, [{ captured: 'C:\\capture\\tree', source: 'D:\\' }])).toBe('D:\\repo\\package.json');
  },
);

it('does not project an adjacent directory with the same prefix', () => {
  const file = '\\\\?\\C:\\capture\\tree-other\\package.json';
  expect(compilerSourcePath(file, [{ captured: 'C:\\capture\\tree', source: 'D:\\' }])).toBe(file);
});

it.each([
  ['C:\\pack', 'D:\\repo\\node_modules\\dependency'],
  ['\\\\?\\C:\\pack', 'D:\\repo\\node_modules\\dependency'],
  ['C:\\pack', '\\\\?\\D:\\repo\\node_modules\\dependency'],
  ['\\\\server\\one\\pack', '\\\\server\\two\\dependency'],
  ['\\\\?\\UNC\\server\\one\\pack', '\\\\?\\UNC\\other\\one\\dependency'],
  ['\\\\?\\unc\\server\\one\\pack', '\\\\?\\unc\\server\\two\\dependency'],
])('replays cross-root compiler paths without inventing relative drive/share components: %s → %s', (from, to) => {
  const relative = relativeCompilerPath(from, to);
  expect(path.isAbsolute(relative)).toBe(true);
  const encoded = relative.split(path.sep).join('/');
  expect(path.resolve(from, encoded)).toBe(path.toNamespacedPath(to));
  expect(compilerSourcePath(to, [{ captured: from, source: 'E:\\original' }])).toBe(to);
});
