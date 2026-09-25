import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bundlePackSeedRuntime } from '../../src/build/be-bundler';
import { REPO_ROOT } from '../helpers/published-packages';

/** A seed runtime that bundles but can't load where dependents' unit tests load it fails `abuddy build` */
const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function pack(repository: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-seed-runtime-load-'));
  tmpDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'load-pack', type: 'module' }));
  fs.writeFileSync(path.join(dir, 'abuddy.json'), JSON.stringify({ id: 'load-pack', name: 'Load', version: '1.0.0' }));
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  const files: Record<string, string> = {
    'src/repository.ts': repository,
    'src/__generated__/seed-runtime.ts': [
      "import type { SeedRuntime } from '@abuddy/sdk/testing';",
      "import { memoQueries } from '../repository';",
      "export const seedRuntime: SeedRuntime = { id: 'load-pack', entities: { Memo: 'Memo' }, relKinds: {}, repositories: { memoQueries }, seedHooks: {} };",
    ].join('\n'),
  };
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

describe('abuddy build loads the seed runtime it bundles', () => {
  it('passes a seed runtime that uses only @abuddy/sdk', async () => {
    const dir = pack("import { findRelations } from '@abuddy/ears';\nexport const memoQueries = { links: findRelations };\n");
    expect(await bundlePackSeedRuntime(dir, path.join(dir, 'dist'))).toEqual({ success: true });
  });

  it('passes when the caller carries the source condition, as npm test and PACK_DIR builds do', async () => {
    // The check loads the bundle in a child process. Inheriting --conditions=@abuddy/source would make
    // that child resolve the packages' TypeScript with no loader to read it, and the build would fail
    // naming the pack's seed runtime rather than the loader.
    const dir = pack("import { findRelations } from '@abuddy/ears';\nexport const memoQueries = { links: findRelations };\n");
    const before = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = `${before ?? ''} --conditions=@abuddy/source`.trim();
    try {
      expect(await bundlePackSeedRuntime(dir, path.join(dir, 'dist'))).toEqual({ success: true });
    } finally {
      if (before === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = before;
    }
  });

  it('fails one bundling a native addon', async () => {
    // The shape of node-gyp-build and bindings: the addon path is computed, so esbuild leaves the require
    const dir = pack([
      "import { createRequire } from 'node:module';",
      "const addon = 'memo_index';",
      'const native = createRequire(import.meta.url)(`./build/Release/${addon}.node`);',
      'export const memoQueries = { search: native.search };',
    ].join('\n'));
    const result = await bundlePackSeedRuntime(dir, path.join(dir, 'dist'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Cannot find module '.*memo_index\.node'/);
  });

  it('fails one that throws while loading', async () => {
    const dir = pack("if (!('abuddyHost' in globalThis)) throw new Error('memo repository needs the app');\nexport const memoQueries = {};\n");
    const result = await bundlePackSeedRuntime(dir, path.join(dir, 'dist'));
    expect(result.error).toContain('memo repository needs the app');
  });
});
