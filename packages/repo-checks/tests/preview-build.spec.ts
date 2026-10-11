import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { previewEnvironment, previewVersion } from '../../../scripts/lib/preview-build.ts';
import { resolveBuildMetadata, createBuildSession, readBuildManifest, sealBuildSession, verifyBuildArtifacts, verifyPackagedBuild } from '../../../build/build-metadata.ts';

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

  it('isolates channels and rejects incomplete or changed artifacts before packaging', () => {
    const preview = createBuildSession(previewEnvironment('0.4.0-preview.1', {}));
    const production = createBuildSession({ APACK_ENV: 'production' });
    dirs.push(preview, production);
    expect(preview).not.toBe(production);
    expect(readBuildManifest(preview).version).toBe('0.4.0-preview.1');
    expect(readBuildManifest(production).channel).toBe('production');
    expect(() => verifyBuildArtifacts(preview)).toThrow();
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-package-'));
    dirs.push(app);
    for (const workspace of ['main', 'api', 'renderer', 'preload']) {
      const dist = path.join(preview, 'packages', workspace, 'dist');
      fs.mkdirSync(dist, { recursive: true });
      fs.writeFileSync(path.join(dist, 'index.js'), workspace);
    }
    sealBuildSession(preview);
    fs.cpSync(preview, app, { recursive: true });
    fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ version: '0.4.0-preview.1' }));
    expect(() => verifyPackagedBuild(app, preview)).not.toThrow();
    for (const workspace of ['main', 'api', 'renderer', 'preload']) {
      const file = path.join(app, 'packages', workspace, 'dist/index.js');
      fs.writeFileSync(file, 'stale');
      expect(() => verifyPackagedBuild(app, preview)).toThrow(/artifacts differ/);
      fs.writeFileSync(file, workspace);
    }
    fs.writeFileSync(path.join(app, 'build-manifest.json'), '{}');
    expect(() => verifyPackagedBuild(app, preview)).toThrow(/artifacts differ/);
    fs.copyFileSync(path.join(preview, 'build-manifest.json'), path.join(app, 'build-manifest.json'));
    fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ version: '0.3.14' }));
    expect(() => verifyPackagedBuild(app, preview)).toThrow(/Packaged version/);
    fs.writeFileSync(path.join(preview, 'packages/api/dist/index.js'), 'changed after build');
    expect(() => verifyBuildArtifacts(preview)).toThrow(/artifacts differ/);
  });
});
