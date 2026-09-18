import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertSourceResolution, type ResolveFile } from '../../src/build/source-resolution.ts';

const MANIFEST = {
  name: '@abuddy/sdk',
  type: 'module',
  exports: {
    './package.json': './package.json',
    '.': { '@abuddy/source': './src/index.ts', default: './dist/index.js' },
  },
};

let root: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-source-resolution-')));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** A checkout whose workspace @abuddy/sdk is linked into node_modules, as npm workspaces do */
function checkout({ built }: { built: boolean }): string {
  const dir = path.join(root, 'checkout');
  const sdk = path.join(dir, 'packages', 'abuddy-sdk');
  write(path.join(sdk, 'package.json'), JSON.stringify(MANIFEST));
  write(path.join(sdk, 'src', 'index.ts'), 'export {};');
  if (built) write(path.join(sdk, 'dist', 'index.js'), 'export {};');
  fs.mkdirSync(path.join(dir, 'node_modules', '@abuddy'), { recursive: true });
  fs.symlinkSync(sdk, path.join(dir, 'node_modules', '@abuddy', 'sdk'), 'dir');
  return dir;
}

/** Resolves from `cwd` in a plain Node process, with or without the source condition */
function nodeResolver(cwd: string, conditions: string[] = []): ResolveFile {
  return (specifier) => execFileSync(
    process.execPath,
    [...conditions.map((c) => `--conditions=${c}`), '-p', `require.resolve(${JSON.stringify(specifier)})`],
    { cwd, env: { PATH: process.env.PATH }, stdio: 'pipe' },
  ).toString().trim();
}

describe('assertSourceResolution', () => {
  it('throws when a checkout resolves to its built dist', () => {
    const dir = checkout({ built: true });
    expect(() => assertSourceResolution(nodeResolver(dir), 'The test process'))
      .toThrow(/The test process resolves @abuddy\/sdk to dist\/index\.js instead of the checkout's source/);
  });

  it('throws when a checkout has no dist and no condition', () => {
    const dir = checkout({ built: false });
    expect(() => assertSourceResolution(nodeResolver(dir), 'The test process')).toThrow(/to its unbuilt dist/);
  });

  it('passes when the run declared it resolves the published packages', () => {
    const dir = checkout({ built: true });
    expect(() => assertSourceResolution(nodeResolver(dir), 'The test process')).toThrow();
    process.env.ABUDDY_PACKAGES = 'dist';
    try {
      expect(() => assertSourceResolution(nodeResolver(dir), 'The test process')).not.toThrow();
    } finally {
      delete process.env.ABUDDY_PACKAGES;
    }
  });

  it('passes when the process has the source condition', () => {
    const dir = checkout({ built: true });
    expect(() => assertSourceResolution(nodeResolver(dir, ['@abuddy/source']), 'The test process')).not.toThrow();
  });

  it('passes for an installed package, which ships no src', () => {
    const dir = path.join(root, 'pack');
    const sdk = path.join(dir, 'node_modules', '@abuddy', 'sdk');
    write(path.join(sdk, 'package.json'), JSON.stringify(MANIFEST));
    write(path.join(sdk, 'dist', 'index.js'), 'export {};');
    expect(() => assertSourceResolution(nodeResolver(dir), 'The test process')).not.toThrow();
  });

  it('passes when the packages are not installed', () => {
    const dir = path.join(root, 'empty');
    fs.mkdirSync(dir);
    expect(() => assertSourceResolution(nodeResolver(dir), 'The test process')).not.toThrow();
  });
});
