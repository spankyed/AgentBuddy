import fs from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { physicalWatchPath } from '../../src/build/compiler-inputs/watch-paths.ts';

it('resolves extended Windows drive roots through their equivalent DOS spelling', () => {
  const native = vi.spyOn(fs.realpathSync, 'native').mockImplementation(file => {
    if (file === 'C:\\') return 'C:\\';
    throw Object.assign(new Error('root realpath failed'), { code: 'EISDIR' });
  });
  try {
    expect(physicalWatchPath('\\\\?\\C:\\')).toBe('C:\\');
    expect(native).toHaveBeenCalledWith('C:\\');
  } finally { native.mockRestore(); }
});

it('preserves non-root realpath errors instead of treating them as missing inputs', () => {
  const native = vi.spyOn(fs.realpathSync, 'native').mockImplementation(() => {
    throw Object.assign(new Error('non-root failure'), { code: 'EISDIR' });
  });
  try {
    const file = path.join(process.cwd(), 'value');
    expect(() => physicalWatchPath(file)).toThrow(`Cannot resolve compiler input path ${JSON.stringify(file)}`);
    try { physicalWatchPath(file); }
    catch (error) { expect((error as Error).cause).toMatchObject({ message: 'non-root failure', code: 'EISDIR' }); }
  }
  finally { native.mockRestore(); }
});
