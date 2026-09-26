import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bundlePackRuntime, bundlePackSeedCompilers, bundlePackStepBuild } from '../../src/build/be-bundler';
import { bundlePackFE } from '../../src/build/fe-bundler';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/** Pack code that imports the app's private @abuddy/host fails `abuddy build`, not the app at load */
const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function pack(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-host-guard-'));
  tmpDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'guard-pack', type: 'module' }));
  fs.writeFileSync(path.join(dir, 'abuddy.json'), JSON.stringify({ id: 'guard-pack', name: 'Guard', version: '1.0.0' }));
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

const HOST_IMPORT = "import { edgeStore } from '@abuddy/host/ears';\nexport const registration = { edgeStore };\n";
const HOST_ERROR = /@abuddy\/host\/ears is the app's private host package; packs import @abuddy\/sdk instead/;

describe('abuddy build rejects @abuddy/host imports', () => {
  it('in the backend runtime', async () => {
    const dir = pack({ 'src/__generated__/pack-entry.ts': HOST_IMPORT });
    const result = await bundlePackRuntime(dir, path.join(dir, 'dist'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(HOST_ERROR);
  });

  it('in step build code and seed compiler modules', async () => {
    const dir = pack({ 'src/steps/build.ts': HOST_IMPORT, 'src/seeds/compilers/memos.ts': `${HOST_IMPORT}export default () => [];\n` });
    expect((await bundlePackStepBuild(dir, path.join(dir, 'dist'), 'src/steps/build.ts')).error).toMatch(HOST_ERROR);
    expect((await bundlePackSeedCompilers(dir, path.join(dir, 'dist'), { memos: 'src/seeds/compilers/memos.ts' })).error).toMatch(HOST_ERROR);
  });

  it('in the frontend bundle', async () => {
    const dir = pack({ 'src/entry.ts': "import { registerPackFE } from '@abuddy/host/fe';\nexport default registerPackFE;\n" });
    const result = await bundlePackFE({ packDir: dir, outputDir: path.join(dir, 'dist'), entryPoint: path.join(dir, 'src', 'entry.ts') });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/@abuddy\/host\/fe is the app's private host package/);
  });

  it('rejects an export only the app loads, the LMDB store', async () => {
    const dir = pack({ 'src/__generated__/pack-entry.ts': "import { openLmdbStore } from '@abuddy/ears/lmdb';\nexport const registration = { openLmdbStore };\n" });
    const result = await bundlePackRuntime(dir, path.join(dir, 'dist'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/@abuddy\/ears\/lmdb is only for the app[\s\S]*packs can't import it/);
  });

  it('still bundles pack code that imports @abuddy/sdk', async () => {
    const dir = pack({ 'src/__generated__/pack-entry.ts': "import { findRelations } from '@abuddy/ears';\nexport const registration = { findRelations };\n" });
    expect(await bundlePackRuntime(dir, path.join(dir, 'dist'))).toEqual({ success: true });
  });
});
