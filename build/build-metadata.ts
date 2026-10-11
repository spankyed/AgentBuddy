import fs from 'node:fs';
import path from 'node:path';
import pkg from '../package.json' with { type: 'json' };

/** Shared by the main/API bundlers and electron-builder; release metadata stays in package.json. */
export interface BuildMetadata {
  version: string;
  channel: string;
  appId: string;
  productName: string;
  urlScheme: string;
}

export function resolveBuildMetadata(env: NodeJS.ProcessEnv = process.env): BuildMetadata {
  const channel = env.APACK_ENV || '';
  if (!['', 'production', 'beta', 'preview', 'development', 'test'].includes(channel)) {
    throw new Error(`Unknown build channel: ${channel}`);
  }
  if (env.APACK_BUILD_VERSION && channel !== 'preview') {
    throw new Error('APACK_BUILD_VERSION is only supported for preview builds; releases use package.json.');
  }
  const version = env.APACK_BUILD_VERSION || pkg.version;
  if (channel === 'preview' && !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-preview\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Preview builds require APACK_BUILD_VERSION=<version>-preview.<iteration>. Use npm run build:preview -- --version <version>.');
  }
  const suffix = channel === 'beta' ? 'beta' : channel === 'preview' ? 'preview' : null;
  return {
    version,
    channel,
    appId: suffix ? `dev.apack.${suffix}` : 'dev.apack.app',
    productName: suffix ? `apack ${suffix === 'beta' ? 'Beta' : 'Preview'}` : 'apack',
    urlScheme: suffix ? `apack-${suffix}` : 'apack',
  };
}

/** Rejects stale process bundles before signing or producing an installable app. */
export function verifyPackagedBuild(appDir: string, expected: BuildMetadata): void {
  if (!['production', 'beta', 'preview'].includes(expected.channel)) {
    throw new Error(`Cannot package an unstamped build (${expected.channel || 'no channel'}). Use the production, beta, or preview build command.`);
  }
  const packaged = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  if (packaged.version !== expected.version) throw new Error(`Packaged version ${packaged.version} differs from ${expected.version}`);
  for (const [name, metadata] of [
    ['package', packaged.apackBuild],
    ['main', JSON.parse(fs.readFileSync(path.join(appDir, 'packages/main/dist/build-metadata.json'), 'utf8'))],
    ['API', JSON.parse(fs.readFileSync(path.join(appDir, 'packages/api/dist/build-metadata.json'), 'utf8'))],
  ] as const) {
    for (const key of Object.keys(expected) as (keyof BuildMetadata)[]) {
      if (metadata?.[key] !== expected[key]) throw new Error(`${name} build metadata ${key} differs: expected ${expected[key]}, got ${metadata?.[key]}`);
    }
  }
}
