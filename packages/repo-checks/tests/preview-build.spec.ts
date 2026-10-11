import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { previewEnvironment, previewVersion } from '../../../scripts/lib/preview-build.ts';
import { resolveBuildMetadata, verifyPackagedBuild } from '../../../build/build-metadata.ts';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('local preview builds', () => {
  it('versions previews without changing release metadata', () => {
    expect(previewVersion(['--version', '0.4.0'])).toBe('0.4.0-preview.1');
    expect(previewVersion(['--version=0.4.0-preview.2'])).toBe('0.4.0-preview.2');
    for (const args of [[], ['--version', 'latest'], ['--version', '0.4.0-beta.1'], ['--publish']]) {
      expect(() => previewVersion(args)).toThrow();
    }
  });

  it('gives the builders one version and identity and disables inherited publishing/signing', () => {
    const env = previewEnvironment('0.4.0-preview.2', { APACK_ENV: 'production', PUBLISH_TO_GITHUB: 'true', NODE_ENV: 'production' });
    expect(env.PUBLISH_TO_GITHUB).toBe('false');
    expect(env.CSC_IDENTITY_AUTO_DISCOVERY).toBe('false');
    expect(env.NODE_ENV).toBeUndefined();
    expect(resolveBuildMetadata(env)).toEqual({ version: '0.4.0-preview.2', channel: 'preview',
      productName: 'apack Preview', appId: 'dev.apack.preview', urlScheme: 'apack-preview' });
    expect(() => resolveBuildMetadata({ APACK_ENV: 'production', APACK_BUILD_VERSION: '0.4.0-preview.2' })).toThrow(/only supported for preview/);
    expect(() => resolveBuildMetadata({ APACK_ENV: 'preview' })).toThrow(/Preview builds require/);
  });

  it('rejects a stale API or main bundle and a mismatched packaged version', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-packaging-'));
    dirs.push(dir);
    const metadata = resolveBuildMetadata(previewEnvironment('0.4.0-preview.1', {}));
    expect(() => verifyPackagedBuild(dir, resolveBuildMetadata({}))).toThrow(/unstamped build/);
    const write = (file: string, value: unknown) => {
      const target = path.join(dir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(value));
    };
    const packageFile = { version: metadata.version, apackBuild: metadata };
    write('package.json', packageFile);
    for (const process of ['main', 'api']) write(`packages/${process}/dist/build-metadata.json`, metadata);
    expect(() => verifyPackagedBuild(dir, metadata)).not.toThrow();
    for (const process of ['main', 'api']) {
      write(`packages/${process}/dist/build-metadata.json`, { ...metadata, version: '0.3.14' });
      expect(() => verifyPackagedBuild(dir, metadata)).toThrow(/build metadata version differs/);
      write(`packages/${process}/dist/build-metadata.json`, metadata);
    }
    write('packages/api/dist/build-metadata.json', { ...metadata, channel: 'production' });
    expect(() => verifyPackagedBuild(dir, metadata)).toThrow(/build metadata channel differs/);
    write('packages/api/dist/build-metadata.json', metadata);
    write('package.json', { ...packageFile, version: '0.3.14' });
    expect(() => verifyPackagedBuild(dir, metadata)).toThrow(/Packaged version/);
  });
});
