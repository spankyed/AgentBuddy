import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packFixture } from '@abuddy/sdk/testing/pack-fixture';
import { bundlePackContentRuntime } from '../../src/build/be-bundler';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/** A content runtime that bundles but can't load where dependents' unit tests load it fails `abuddy build` */
const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function pack(repository: string): string {
  const dir = packFixture({ manifest: { id: 'load-pack', name: 'Load' }, nodeModules: path.join(REPO_ROOT, 'node_modules') });
  tmpDirs.push(dir);
  const files: Record<string, string> = {
    'src/repository.ts': repository,
    'src/__generated__/content-runtime.ts': [
      "import type { ContentRuntime } from '@abuddy/sdk/testing';",
      "import { memoQueries } from '../repository';",
      "export const contentRuntime: ContentRuntime = { id: 'load-pack', entities: { Memo: 'Memo' }, relKinds: {}, repositories: { memoQueries }, contentWriters: {} };",
    ].join('\n'),
  };
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

describe('abuddy build loads the content runtime it bundles', () => {
  it('passes a content runtime that uses only @abuddy/sdk', async () => {
    const dir = pack("import { findRelations } from '@abuddy/ears';\nexport const memoQueries = { links: findRelations };\n");
    expect(await bundlePackContentRuntime(dir, path.join(dir, 'dist'))).toEqual({ success: true });
  });

  it('passes when the caller carries the source condition, as npm test and PACK_DIR builds do', async () => {
    // The check loads the bundle in a child process. Inheriting --conditions=@abuddy/source would make
    // that child resolve the packages' TypeScript with no loader to read it, and the build would fail
    // naming the pack's content runtime rather than the loader.
    const dir = pack("import { findRelations } from '@abuddy/ears';\nexport const memoQueries = { links: findRelations };\n");
    const before = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = `${before ?? ''} --conditions=@abuddy/source`.trim();
    try {
      expect(await bundlePackContentRuntime(dir, path.join(dir, 'dist'))).toEqual({ success: true });
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
    const result = await bundlePackContentRuntime(dir, path.join(dir, 'dist'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Cannot find module '.*memo_index\.node'/);
  });

  it('fails one that throws while loading', async () => {
    const dir = pack("if (!('abuddyHost' in globalThis)) throw new Error('memo repository needs the app');\nexport const memoQueries = {};\n");
    const result = await bundlePackContentRuntime(dir, path.join(dir, 'dist'));
    expect(result.error).toContain('memo repository needs the app');
  });
});
