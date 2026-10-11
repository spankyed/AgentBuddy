import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveTestHost } from '../src/test-host.ts';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-test-host-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

function checkout(name: string): string {
  const dir = path.join(root, name);
  for (const relative of ['packages/main/dist', 'packages/renderer/dist', 'node_modules/electron']) {
    fs.mkdirSync(path.join(dir, relative), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'packages/entry-point.mjs'), '');
  return fs.realpathSync(dir);
}

function executable(name: string): string {
  const file = path.join(root, name);
  fs.writeFileSync(file, '');
  return fs.realpathSync(file);
}

describe('test host identity', () => {
  it('uses a standalone fixture option when the CLI supplies no host', () => {
    const appRoot = checkout('source');
    expect(resolveTestHost({ appRoot }, {})).toEqual({ kind: 'source', root: appRoot });
  });

  it('refuses fixture options that would launch a different source host', () => {
    const pinned = checkout('pinned');
    const other = checkout('other');
    expect(() => resolveTestHost({ appRoot: other }, { APACK_HOST_ROOT: pinned })).toThrow('conflict');
  });

  it('accepts a symlink to the resolved source host', () => {
    const pinned = checkout('pinned');
    const link = path.join(root, 'alias');
    fs.symlinkSync(pinned, link);
    expect(resolveTestHost({ appRoot: link }, { APACK_HOST_ROOT: pinned }))
      .toEqual({ kind: 'source', root: pinned });
  });

  it('refuses a different executable or a switch from packaged to source', () => {
    const pinned = executable('pinned');
    expect(() => resolveTestHost({ appExecutable: executable('other') }, { APACK_HOST_EXECUTABLE: pinned })).toThrow('conflict');
    expect(() => resolveTestHost({ appRoot: checkout('source') }, { APACK_HOST_EXECUTABLE: pinned })).toThrow('conflict');
    expect(resolveTestHost({ appExecutable: pinned }, { APACK_HOST_EXECUTABLE: pinned }))
      .toEqual({ kind: 'packaged', executable: pinned });
  });

  it('refuses two identities in either options or handoff', () => {
    expect(() => resolveTestHost({ appRoot: '/source', appExecutable: '/app' }, {})).toThrow('one test host');
    expect(() => resolveTestHost({}, { APACK_HOST_ROOT: '/source', APACK_HOST_EXECUTABLE: '/app' })).toThrow('one resolved host');
  });
});
