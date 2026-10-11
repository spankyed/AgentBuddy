import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
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

/** A new directory for each packaging run; workspace dist remains for development/checks. */
export function createBuildSession(env: NodeJS.ProcessEnv = process.env): string {
  const metadata = resolveBuildMetadata(env);
  if (!['production', 'beta', 'preview'].includes(metadata.channel)) throw new Error('Packaging requires a production, beta, or preview channel.');
  const parent = path.resolve('.temp/app-builds');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, `${metadata.channel}-`));
  fs.writeFileSync(path.join(root, 'build-manifest.json'), JSON.stringify(metadata, null, 2) + '\n');
  return root;
}

export function readBuildManifest(root: string): BuildMetadata {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'build-manifest.json'), 'utf8')) as BuildMetadata;
  if (!['production', 'beta', 'preview'].includes(metadata.channel) || !metadata.version) throw new Error('Invalid packaged build manifest');
  return metadata;
}

export function appBuildOutput(workspace: string): string {
  const root = process.env.APACK_BUILD_ROOT;
  if (!root) return 'dist';
  readBuildManifest(root);
  return path.join(root, 'packages', workspace, 'dist');
}

const WORKSPACES = ['main', 'api', 'renderer', 'preload'] as const;
function artifactHashes(root: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  function walk(relative: string): void {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) hashes[file] = createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
      else throw new Error(`Unexpected build artifact: ${file}`);
    }
  }
  for (const workspace of WORKSPACES) {
    const dir = `packages/${workspace}/dist`;
    walk(dir);
    if (!Object.keys(hashes).some(file => file.startsWith(`${dir}/`))) throw new Error(`Missing build output: ${workspace}`);
  }
  hashes['build-manifest.json'] = createHash('sha256').update(fs.readFileSync(path.join(root, 'build-manifest.json'))).digest('hex');
  return hashes;
}

/** Written only after all four bundlers succeed; an interrupted run cannot be packaged. */
export function sealBuildSession(root: string): void {
  readBuildManifest(root);
  fs.writeFileSync(path.join(root, 'build-artifacts.json'), JSON.stringify(artifactHashes(root), null, 2) + '\n');
}

export function verifyBuildArtifacts(root: string, appDir = root): void {
  const expected = JSON.parse(fs.readFileSync(path.join(root, 'build-artifacts.json'), 'utf8'));
  const actual = artifactHashes(appDir);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Build artifacts differ from the completed staging build');
}

/** Packaging consumes only a completed stage, then verifies the actual packaged files. */
export function verifyPackagedBuild(appDir: string, root: string): void {
  const manifest = readBuildManifest(root);
  const packaged = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  if (packaged.version !== manifest.version) throw new Error(`Packaged version ${packaged.version} differs from ${manifest.version}`);
  verifyBuildArtifacts(root, appDir);
}
