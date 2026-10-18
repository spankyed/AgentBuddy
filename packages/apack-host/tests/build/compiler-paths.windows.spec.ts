import { expect, it, vi } from 'vitest';

vi.mock('node:path', async original => {
  const path = await original<typeof import('node:path')>();
  return { ...path, default: path.win32 };
});

import { compilerSourcePath, relativeCompilerPath } from '../../src/build/compiler-inputs/compiler-paths.ts';

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
