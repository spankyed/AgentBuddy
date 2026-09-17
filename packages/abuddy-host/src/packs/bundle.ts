/**
 * Pack bundle: the one layout an external pack has everywhere — build output
 * (dist/), the release archive, and the installed pack directory.
 *
 *   <id>/abuddy.json            the pack's manifest
 *   <id>/bundle.json            format version, versions, source, sha256 per file
 *   <id>/runtime/index.cjs      backend: exports `registration` + `setCompiledDir`
 *   <id>/runtime/fe.js, fe.css  frontend
 *   <id>/runtime/seeds/         compiled seed data
 *   <id>/build/                 build-time code dependents load (step build facets)
 *   <id>/types/snapshot.json    types + manifest for dependents' codegen
 *
 * `abuddy build` writes runtime/, build/ and types/ into dist/. Staging adds the
 * manifest and bundle.json. The installer copies a verified stage into
 * the packs directory unchanged, and the host loader reads it as-is.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as tar from 'tar';
import type { PackManifest } from '@abuddy/sdk/build';
import { stagingDirName } from './staging.ts';

export const BUNDLE_FORMAT_VERSION = 1;

export const BUNDLE_PATHS = {
  manifest: 'abuddy.json',
  info: 'bundle.json',
  runtimeDir: 'runtime',
  runtimeEntry: 'runtime/index.cjs',
  feEntry: 'runtime/fe.js',
  feStyles: 'runtime/fe.css',
  seedsDir: 'runtime/seeds',
  buildDir: 'build',
  stepsBuild: 'build/steps.build.mjs',
  typesDir: 'types',
  snapshot: 'types/snapshot.json',
} as const;

/** Sections `abuddy build` writes into dist/ and staging copies into the bundle. */
const SECTIONS = [BUNDLE_PATHS.runtimeDir, BUNDLE_PATHS.buildDir, BUNDLE_PATHS.typesDir];

export interface BundleInfo {
  formatVersion: number;
  id: string;
  version: string;
  hostVersion?: string;
  sdkVersion?: string;
  source?: { repo?: string; commit?: string };
  /** sha256 of every file in the bundle except bundle.json, keyed by bundle-relative path. */
  files: Record<string, string>;
}

export function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

export function isBundleDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, BUNDLE_PATHS.info));
}

/** Whether a pack source directory has been built in the bundle layout. */
export function hasBuiltBundleSections(packRoot: string): boolean {
  const dist = path.join(packRoot, 'dist');
  return fs.existsSync(path.join(dist, BUNDLE_PATHS.runtimeEntry)) && fs.existsSync(path.join(dist, BUNDLE_PATHS.snapshot));
}

/** A pack whose frontend the renderer loads (the API's `packs.registry`) */
export interface PackBundleEntry {
  id: string;
  name: string;
  version: string;
  builtIn?: boolean;
  /** The bundle's runtime/fe.js, when it has one */
  feEntry?: string;
  /** The bundle's runtime/fe.css, when it has one */
  feStyles?: string;
}

/** A bundle's frontend files, bundle-relative: its FE entry and stylesheet when `abuddy build` wrote them */
export function packFrontendFiles(bundleDir: string): { entry?: string; styles?: string } {
  const has = (file: string) => fs.existsSync(path.join(bundleDir, file));
  return {
    entry: has(BUNDLE_PATHS.feEntry) ? BUNDLE_PATHS.feEntry : undefined,
    styles: has(BUNDLE_PATHS.feStyles) ? BUNDLE_PATHS.feStyles : undefined,
  };
}

/**
 * Assemble a bundle directory from a built pack. Throws if the pack hasn't been
 * built in the bundle layout. Source maps stay out of bundles.
 */
export function stageBundle(
  packRoot: string,
  stageDir: string,
  options: { sdkVersion?: string; source?: BundleInfo['source']; version?: string } = {},
): BundleInfo {
  if (!hasBuiltBundleSections(packRoot)) {
    throw new Error(`Pack at ${packRoot} is not built (missing dist/${BUNDLE_PATHS.runtimeEntry} or dist/${BUNDLE_PATHS.snapshot}). Run "abuddy build" first.`);
  }
  const source: PackManifest = JSON.parse(fs.readFileSync(path.join(packRoot, BUNDLE_PATHS.manifest), 'utf-8'));

  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
  const dist = path.join(packRoot, 'dist');
  for (const section of SECTIONS) {
    const from = path.join(dist, section);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(stageDir, section), {
      recursive: true,
      filter: (src) => !src.endsWith('.map'),
    });
  }

  const manifest: PackManifest = options.version ? { ...source, version: options.version } : source;
  fs.writeFileSync(path.join(stageDir, BUNDLE_PATHS.manifest), JSON.stringify(manifest, null, 2) + '\n');

  const files: Record<string, string> = {};
  for (const rel of listFiles(stageDir)) {
    if (rel === BUNDLE_PATHS.info) continue;
    files[rel] = sha256File(path.join(stageDir, rel));
  }
  const info: BundleInfo = {
    formatVersion: BUNDLE_FORMAT_VERSION,
    id: manifest.id,
    version: manifest.version,
    hostVersion: manifest.hostVersion,
    sdkVersion: options.sdkVersion,
    source: options.source,
    files,
  };
  fs.writeFileSync(path.join(stageDir, BUNDLE_PATHS.info), JSON.stringify(info, null, 2) + '\n');
  return info;
}

export function readBundleInfo(dir: string): BundleInfo {
  const infoPath = path.join(dir, BUNDLE_PATHS.info);
  if (!fs.existsSync(infoPath)) throw new Error(`Not a pack bundle: no ${BUNDLE_PATHS.info} in ${dir}`);
  return JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
}

/** Check format version and that the files on disk are exactly the ones recorded. */
export function verifyBundle(dir: string): BundleInfo {
  const info = readBundleInfo(dir);
  if (Math.floor(info.formatVersion) !== BUNDLE_FORMAT_VERSION) {
    throw new Error(`Pack bundle ${info.id} uses format ${info.formatVersion}; this host supports format ${BUNDLE_FORMAT_VERSION}. Update AgentBuddy or rebuild the pack.`);
  }
  const problems: string[] = [];
  const onDisk = new Set(listFiles(dir).filter(f => f !== BUNDLE_PATHS.info));
  for (const [rel, expected] of Object.entries(info.files)) {
    if (!onDisk.has(rel)) problems.push(`missing ${rel}`);
    else if (sha256File(path.join(dir, rel)) !== expected) problems.push(`checksum mismatch ${rel}`);
    onDisk.delete(rel);
  }
  for (const extra of onDisk) problems.push(`unexpected ${extra}`);
  if (problems.length > 0) {
    throw new Error(`Pack bundle ${info.id}@${info.version} failed verification:\n${problems.map(p => `  - ${p}`).join('\n')}`);
  }
  return info;
}

export function bundleArchiveName(id: string, version: string): string {
  return `${id}-${version}.tgz`;
}

/** Write <outDir>/<id>-<version>.tgz (entries prefixed with <id>/) and its .sha256 file. */
export async function createBundleArchive(stageDir: string, outDir: string): Promise<{ file: string; sha256: string; checksumFile: string }> {
  const info = readBundleInfo(stageDir);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, bundleArchiveName(info.id, info.version));
  // Reproducible archives: no uid/gid or mtimes
  await tar.create({ gzip: true, file, cwd: stageDir, prefix: info.id, portable: true, noMtime: true }, fs.readdirSync(stageDir).sort());
  const sha256 = sha256File(file);
  const checksumFile = `${file}.sha256`;
  fs.writeFileSync(checksumFile, `${sha256}  ${path.basename(file)}\n`);
  return { file, sha256, checksumFile };
}

/** Extract a bundle archive into destDir/<id>/ and return that directory. */
export async function extractBundleArchive(archive: string, destDir: string, expectedSha256?: string): Promise<string> {
  if (expectedSha256) {
    const actual = sha256File(archive);
    if (actual !== expectedSha256) {
      throw new Error(`Checksum mismatch for ${path.basename(archive)}: expected ${expectedSha256}, got ${actual}`);
    }
  }
  fs.mkdirSync(destDir, { recursive: true });
  await tar.extract({ file: archive, cwd: destDir });
  const dirs = fs.readdirSync(destDir, { withFileTypes: true }).filter(e => e.isDirectory());
  if (dirs.length !== 1) throw new Error(`Pack archive ${path.basename(archive)} must contain exactly one top-level directory`);
  return path.join(destDir, dirs[0].name);
}

/** A built-in pack's compiled seed files in its dist/ (`*.seed.json`, `seeds.json`, `media/`), relative to it */
function builtInSeedFiles(distDir: string): string[] {
  if (!fs.existsSync(distDir)) return [];
  const top = fs.readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.seed.json') || entry.name === 'seeds.json'))
    .map((entry) => entry.name);
  const mediaDir = path.join(distDir, 'media');
  const media = fs.existsSync(mediaDir) ? listFiles(mediaDir).map((file) => `media/${file}`) : [];
  return [...top, ...media].sort();
}

/**
 * In a built-in pack's dist/, the sha256 of the compiled seeds index (seeds.json) its runtime was built
 * beside. The pack's runtime build writes it with runtime/index.cjs; `abuddy build` writes the seeds.
 */
const BUILT_IN_RUNTIME_SEEDS_HASH = 'runtime/seeds-index.sha256';

/**
 * Publish a built-in pack's artifacts in the bundle layout (dist/snapshot.json → types/snapshot.json,
 * dist/build/ → build/, dist/runtime/index.cjs → runtime/index.cjs, compiled seeds → runtime/seeds/) so
 * pack authors resolve it as a dependency from the installed app: builds use its types and build
 * code, tests its runtime with the seed data it reads (settings defaults). Returns false when the
 * destination was already current. Throws, publishing nothing, when the runtime wasn't built beside
 * the compiled seeds (seeds compiled again without rebuilding the runtime).
 */
export function publishHostPackArtifacts(builtInPackDir: string, destDir: string): boolean {
  const distDir = path.join(builtInPackDir, 'dist');
  const snapshot = path.join(distDir, 'snapshot.json');
  if (!fs.existsSync(snapshot)) return false;
  const buildDir = path.join(distDir, 'build');
  const runtimeEntry = path.join(distDir, BUNDLE_PATHS.runtimeEntry);
  const seedsIndex = path.join(distDir, 'seeds.json');
  if (fs.existsSync(runtimeEntry) && fs.existsSync(seedsIndex)) {
    const hashFile = path.join(distDir, BUILT_IN_RUNTIME_SEEDS_HASH);
    const builtBeside = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, 'utf-8').trim() : undefined;
    if (builtBeside !== sha256File(seedsIndex)) {
      throw new Error(`${runtimeEntry} wasn't built beside the compiled seeds in ${distDir} (${BUILT_IN_RUNTIME_SEEDS_HASH} doesn't match seeds.json), so it isn't published with them: rebuild the pack's runtime (npm run build in the pack)`);
    }
  }
  const seedFiles = fs.existsSync(runtimeEntry) ? builtInSeedFiles(distDir) : [];

  const sources = [
    snapshot,
    ...(fs.existsSync(buildDir) ? listFiles(buildDir).map(f => path.join(buildDir, f)) : []),
    ...(fs.existsSync(runtimeEntry) ? [runtimeEntry] : []),
    ...seedFiles.map((file) => path.join(distDir, file)),
  ];
  const fingerprint = sources.map(f => `${path.relative(builtInPackDir, f)}:${sha256File(f)}`).join('\n');
  const fingerprintFile = path.join(destDir, '.fingerprint');
  if (fs.existsSync(fingerprintFile) && fs.readFileSync(fingerprintFile, 'utf-8') === fingerprint) return false;

  // Hidden, so a crash mid-publish never leaves a directory that looks like a pack id
  const staging = path.join(path.dirname(destDir), stagingDirName(path.basename(destDir), 'publishing'));
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(path.join(staging, BUNDLE_PATHS.typesDir), { recursive: true });
  fs.copyFileSync(snapshot, path.join(staging, BUNDLE_PATHS.snapshot));
  if (fs.existsSync(buildDir)) fs.cpSync(buildDir, path.join(staging, BUNDLE_PATHS.buildDir), { recursive: true });
  if (fs.existsSync(runtimeEntry)) {
    fs.mkdirSync(path.join(staging, BUNDLE_PATHS.runtimeDir), { recursive: true });
    fs.copyFileSync(runtimeEntry, path.join(staging, BUNDLE_PATHS.runtimeEntry));
    for (const file of seedFiles) {
      const target = path.join(staging, BUNDLE_PATHS.seedsDir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(distDir, file), target);
    }
  }
  fs.writeFileSync(path.join(staging, '.fingerprint'), fingerprint);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  fs.renameSync(staging, destDir);
  return true;
}

