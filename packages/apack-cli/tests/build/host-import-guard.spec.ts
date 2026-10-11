import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packFixture } from '@apack/sdk/testing/pack-fixture';
import { bundlePackRuntime, bundlePackContentCompilers, bundlePackStepBuild } from '../../src/build/be-bundler';
import { bundlePackFE } from '../../src/build/fe-bundler';
import { REPO_ROOT } from '@apack/host/build/packages-built';

/** Pack code that imports the app's private @apack/host fails `apack build`, not the app at load */
const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function pack(files: Record<string, string>): string {
  const dir = packFixture({ manifest: { id: 'guard-pack', name: 'Guard' }, files, nodeModules: path.join(REPO_ROOT, 'node_modules') });
  tmpDirs.push(dir);
  return dir;
}

const HOST_IMPORT = "import { edgeStore } from '@apack/host/ears';\nexport const registration = { edgeStore };\n";
const HOST_ERROR = /@apack\/host\/ears is the app's private host package; packs import @apack\/sdk instead/;

describe('apack build rejects @apack/host imports', () => {
  it('in the backend runtime', async () => {
    const dir = pack({ 'src/__generated__/pack-entry.ts': HOST_IMPORT });
    const result = await bundlePackRuntime(dir, path.join(dir, 'dist'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(HOST_ERROR);
  });

  it('in step build code and content compiler modules', async () => {
    const dir = pack({ 'src/__generated__/steps-build.ts': HOST_IMPORT, 'src/content/compilers/memos.ts': `${HOST_IMPORT}export default () => [];\n` });
    expect((await bundlePackStepBuild(dir, path.join(dir, 'dist'))).error).toMatch(HOST_ERROR);
    expect((await bundlePackContentCompilers(dir, path.join(dir, 'dist'), { memos: 'src/content/compilers/memos.ts' })).error).toMatch(HOST_ERROR);
  });

  it('in the frontend bundle', async () => {
    const dir = pack({ 'src/entry.ts': "import { registerPackFE } from '@apack/host/fe';\nexport default registerPackFE;\n" });
    const result = await bundlePackFE({ packDir: dir, outputDir: path.join(dir, 'dist'), entryPoint: path.join(dir, 'src', 'entry.ts') });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/@apack\/host\/fe is the app's private host package/);
  });

  it('rejects an export only the app loads, the LMDB store', async () => {
    const dir = pack({ 'src/__generated__/pack-entry.ts': "import { openLmdbStore } from '@apack/ears/lmdb';\nexport const registration = { openLmdbStore };\n" });
    const result = await bundlePackRuntime(dir, path.join(dir, 'dist'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/@apack\/ears\/lmdb is only for the app[\s\S]*packs can't import it/);
  });

  it('still bundles pack code that imports @apack/sdk', async () => {
    const dir = pack({ 'src/__generated__/pack-entry.ts': "import { findRelations } from '@apack/ears';\nexport const registration = { findRelations };\n" });
    expect(await bundlePackRuntime(dir, path.join(dir, 'dist'))).toEqual({ success: true });
  });
});
