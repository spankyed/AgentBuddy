/**
 * Pack layout: the one layout an external pack has everywhere — build output
 * (dist/), the release archive, and the installed pack directory.
 *
 *   <id>/abuddy.json            the pack's manifest
 *   <id>/integrity.json            format version, versions, source, sha256 per file
 *   <id>/runtime/index.cjs      backend: exports `registration` + `setCompiledDir`
 *   <id>/runtime/fe.js, fe.css  frontend
 *   <id>/runtime/seeds/         compiled seed data
 *   <id>/build/                 build-time code dependents load (step build facets)
 *   <id>/types/snapshot.json    types + manifest for dependents' codegen
 *
 * `abuddy build` writes runtime/, build/ and types/ into dist/. Staging adds the
 * manifest and integrity.json. The installer copies a verified stage into
 * the packs directory unchanged, and the host loader reads it as-is.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as tar from 'tar';
import { _snapshotFormatMismatch, PACK_SNAPSHOT_FORMAT, type PackManifest } from '@abuddy/sdk/build';
import { stagingDirName } from './staging.ts';
import type { PackRegistry } from './pack-registration.ts';

export const PACK_LAYOUT_VERSION = 1;

export const PACK_LAYOUT = {
  manifest: 'abuddy.json',
  integrity: 'integrity.json',
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

/** Sections `abuddy build` writes into dist/ and staging copies into the staged pack. */
const SECTIONS = [PACK_LAYOUT.runtimeDir, PACK_LAYOUT.buildDir, PACK_LAYOUT.typesDir];

export interface PackIntegrity {
  formatVersion: number;
  id: string;
  version: string;
  hostVersion?: string;
  sdkVersion?: string;
  source?: { repo?: string; commit?: string };
  /** sha256 of every file in the pack except integrity.json, keyed by pack-relative path. */
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

export function isPackLayout(dir: string): boolean {
  return fs.existsSync(path.join(dir, PACK_LAYOUT.integrity));
}

/** Whether a pack source directory has been built in the pack layout. */
export function hasBuiltPackSections(packRoot: string): boolean {
  const dist = path.join(packRoot, 'dist');
  return fs.existsSync(path.join(dist, PACK_LAYOUT.runtimeEntry)) && fs.existsSync(path.join(dist, PACK_LAYOUT.snapshot));
}

/** A pack whose frontend the renderer loads (the API's `packs.loaded`) */
export interface LoadedPackEntry {
  id: string;
  name: string;
  version: string;
  builtIn?: boolean;
  /** The pack's runtime/fe.js, when it has one */
  feEntry?: string;
  /** The pack's runtime/fe.css, when it has one */
  feStyles?: string;
  /**
   * Changes whenever those files do. The renderer puts it in the URLs it loads them from: a module or stylesheet is
   * cached by URL, so without it an updated pack kept its old frontend until the window reloaded
   */
  feRevision?: string;
}

/** A pack's frontend files, pack-relative: its FE entry and stylesheet when `abuddy build` wrote them */
export function packFrontendFiles(layoutDir: string): { entry?: string; styles?: string } {
  const has = (file: string) => fs.existsSync(path.join(layoutDir, file));
  return {
    entry: has(PACK_LAYOUT.feEntry) ? PACK_LAYOUT.feEntry : undefined,
    styles: has(PACK_LAYOUT.feStyles) ? PACK_LAYOUT.feStyles : undefined,
  };
}

/** The loaded packs the renderer is told about: the built-in packs, then the external packs with frontend files */
export function getLoadedPackEntries(registry: Pick<PackRegistry, 'builtInPacks' | 'externalPacks'>): LoadedPackEntry[] {
  return [
    ...registry.builtInPacks().map(({ id, name, version }) => ({ id, name, version, builtIn: true })),
    ...registry.externalPacks().flatMap(({ id, name, version, dir }) => {
      const { entry, styles } = packFrontendFiles(dir);
      if (!entry && !styles) return [];
      const feRevision = crypto.createHash('sha256')
        .update([entry, styles].flatMap((file) => (file ? [sha256File(path.join(dir, file))] : [])).join(':'))
        .digest('hex').slice(0, 16);
      return [{ id, name, version, feEntry: entry, feStyles: styles, feRevision }];
    }),
  ];
}

/**
 * The loaded external packs with frontend code: the renderer loads it after connecting, from the entries
 * above, and their systems wait for that rather than for the client
 */
export function getPacksWithClientLoadedFrontends(registry: Pick<PackRegistry, 'externalPacks'>): string[] {
  return registry.externalPacks().filter((p) => packFrontendFiles(p.dir).entry).map((p) => p.id);
}

/**
 * Assemble a staged pack directory from a built pack. Throws if the pack hasn't been
 * built in the pack layout. Source maps stay out of staged packs.
 */
export function stagePack(
  packRoot: string,
  stageDir: string,
  options: { sdkVersion?: string; source?: PackIntegrity['source'] } = {},
): PackIntegrity {
  if (!hasBuiltPackSections(packRoot)) {
    throw new Error(`Pack at ${packRoot} is not built (missing dist/${PACK_LAYOUT.runtimeEntry} or dist/${PACK_LAYOUT.snapshot}). Run "abuddy build" first.`);
  }
  // The built manifest, staged as it is. A pack's version reaches an archive by being written before the
  // build, never by being substituted here: dist/types/snapshot.json is a build artifact copied verbatim,
  // and a dependent range-checks against the version in it while the app reads abuddy.json.
  const manifest: PackManifest = JSON.parse(fs.readFileSync(path.join(packRoot, PACK_LAYOUT.manifest), 'utf-8'));

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

  fs.writeFileSync(path.join(stageDir, PACK_LAYOUT.manifest), JSON.stringify(manifest, null, 2) + '\n');

  const files: Record<string, string> = {};
  for (const rel of listFiles(stageDir)) {
    if (rel === PACK_LAYOUT.integrity) continue;
    files[rel] = sha256File(path.join(stageDir, rel));
  }
  const integrity: PackIntegrity = {
    formatVersion: PACK_LAYOUT_VERSION,
    id: manifest.id,
    version: manifest.version,
    hostVersion: manifest.hostVersion,
    sdkVersion: options.sdkVersion,
    source: options.source,
    files,
  };
  fs.writeFileSync(path.join(stageDir, PACK_LAYOUT.integrity), JSON.stringify(integrity, null, 2) + '\n');
  return integrity;
}

/**
 * Removes the published build output of built-in packs this app no longer has (a pack dropped in a new release), so a
 * tool reading the data dir doesn't keep taking their entity types for the app's. Returns the ids it removed.
 * Hidden staging dirs are left to `recoverStagingDirs`.
 */
export function pruneHostPackOutputs(hostPacksDir: string, keep: Iterable<string>): string[] {
  if (!fs.existsSync(hostPacksDir)) return [];
  const kept = new Set(keep);
  const stale = fs.readdirSync(hostPacksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !kept.has(entry.name))
    .map((entry) => entry.name);
  for (const id of stale) fs.rmSync(path.join(hostPacksDir, id), { recursive: true, force: true });
  return stale;
}

export function readPackIntegrity(dir: string): PackIntegrity {
  const integrityPath = path.join(dir, PACK_LAYOUT.integrity);
  if (!fs.existsSync(integrityPath)) throw new Error(`Not a pack layout: no ${PACK_LAYOUT.integrity} in ${dir}`);
  return JSON.parse(fs.readFileSync(integrityPath, 'utf-8'));
}

/**
 * Why this AgentBuddy can't load the pack built into `dir` (a pack layout), or undefined when it can: its snapshot
 * records the format of the build (`PACK_SNAPSHOT_FORMAT`), which covers the registration its runtime exports as well
 * as what dependents read. `integrity.json`'s format can't say this: whoever stages a pack writes it, not whoever built it.
 */
export function buildFormatProblem(dir: string): string | undefined {
  const snapshotFile = path.join(dir, PACK_LAYOUT.snapshot);
  let snapshot: { format?: unknown; sdkVersion?: string };
  try {
    snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf-8'));
  } catch {
    return `${PACK_LAYOUT.snapshot} is missing or unreadable, so nothing says which abuddy built it: rebuild it with the abuddy CLI that matches this AgentBuddy`;
  }
  const mismatch = _snapshotFormatMismatch(snapshot);
  if (!mismatch) return undefined;
  return `${mismatch.problem}; this AgentBuddy reads format ${PACK_SNAPSHOT_FORMAT}. `
    + (mismatch.newer ? 'Update AgentBuddy to use it' : 'Rebuild it with the abuddy CLI that matches this AgentBuddy');
}

/** Check format version and that the files on disk are exactly the ones recorded. */
export function verifyPack(dir: string): PackIntegrity {
  const integrity = readPackIntegrity(dir);
  if (Math.floor(integrity.formatVersion) !== PACK_LAYOUT_VERSION) {
    throw new Error(`Pack ${integrity.id} uses format ${integrity.formatVersion}; this host supports format ${PACK_LAYOUT_VERSION}. Update AgentBuddy or rebuild the pack.`);
  }
  const problems: string[] = [];
  const onDisk = new Set(listFiles(dir).filter(f => f !== PACK_LAYOUT.integrity));
  for (const [rel, expected] of Object.entries(integrity.files)) {
    if (!onDisk.has(rel)) problems.push(`missing ${rel}`);
    else if (sha256File(path.join(dir, rel)) !== expected) problems.push(`checksum mismatch ${rel}`);
    onDisk.delete(rel);
  }
  for (const extra of onDisk) problems.push(`unexpected ${extra}`);
  if (problems.length > 0) {
    throw new Error(`Pack ${integrity.id}@${integrity.version} failed verification:\n${problems.map(p => `  - ${p}`).join('\n')}`);
  }
  return integrity;
}

export function packArchiveName(id: string, version: string): string {
  return `${id}-${version}.tgz`;
}

/** Write <outDir>/<id>-<version>.tgz (entries prefixed with <id>/) and its .sha256 file. */
export async function createPackArchive(stageDir: string, outDir: string): Promise<{ file: string; sha256: string; checksumFile: string }> {
  const integrity = readPackIntegrity(stageDir);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, packArchiveName(integrity.id, integrity.version));
  // Reproducible archives: no uid/gid or mtimes
  await tar.create({ gzip: true, file, cwd: stageDir, prefix: integrity.id, portable: true, noMtime: true }, fs.readdirSync(stageDir).sort());
  const sha256 = sha256File(file);
  const checksumFile = `${file}.sha256`;
  fs.writeFileSync(checksumFile, `${sha256}  ${path.basename(file)}\n`);
  return { file, sha256, checksumFile };
}

/** Fail unless `file` hashes to `expected` — the checksum published with an archive, or one the caller knows. */
export function assertChecksum(file: string, expected: string): void {
  const actual = sha256File(file);
  if (actual !== expected.toLowerCase()) {
    throw new Error(`Checksum mismatch for ${path.basename(file)}: expected ${expected}, got ${actual}`);
  }
}

/** Extract a pack archive into destDir/<id>/ and return that directory. */
export async function extractPackArchive(archive: string, destDir: string, expectedSha256?: string): Promise<string> {
  if (expectedSha256) assertChecksum(archive, expectedSha256);
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
 * Publish a built-in pack's build output in the pack layout (dist/snapshot.json → types/snapshot.json,
 * dist/build/ → build/, dist/runtime/index.cjs → runtime/index.cjs, compiled seeds → runtime/seeds/) so
 * pack authors resolve it as a dependency from the installed app: builds use its types and build
 * code, tests its runtime with the seed data it reads (settings defaults). Returns false when the
 * destination was already current. Throws, publishing nothing, when the runtime wasn't built beside
 * the compiled seeds (seeds compiled again without rebuilding the runtime).
 */
export function publishHostPackOutput(builtInPackDir: string, destDir: string): boolean {
  const distDir = path.join(builtInPackDir, 'dist');
  const snapshot = path.join(distDir, 'snapshot.json');
  if (!fs.existsSync(snapshot)) return false;
  const buildDir = path.join(distDir, 'build');
  const runtimeEntry = path.join(distDir, PACK_LAYOUT.runtimeEntry);
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
  fs.mkdirSync(path.join(staging, PACK_LAYOUT.typesDir), { recursive: true });
  fs.copyFileSync(snapshot, path.join(staging, PACK_LAYOUT.snapshot));
  if (fs.existsSync(buildDir)) fs.cpSync(buildDir, path.join(staging, PACK_LAYOUT.buildDir), { recursive: true });
  if (fs.existsSync(runtimeEntry)) {
    fs.mkdirSync(path.join(staging, PACK_LAYOUT.runtimeDir), { recursive: true });
    fs.copyFileSync(runtimeEntry, path.join(staging, PACK_LAYOUT.runtimeEntry));
    for (const file of seedFiles) {
      const target = path.join(staging, PACK_LAYOUT.seedsDir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(distDir, file), target);
    }
  }
  fs.writeFileSync(path.join(staging, '.fingerprint'), fingerprint);

  // Move the published copy aside rather than deleting it first, as placePack does: between the delete
  // and the rename the pack has no published output at all, and anything resolving it then — a pack
  // build running beside this one — reads a dependency that does not exist.
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  const previous = fs.existsSync(destDir)
    ? path.join(path.dirname(destDir), stagingDirName(path.basename(destDir), 'previous'))
    : null;
  if (previous) fs.renameSync(destDir, previous);
  try {
    fs.renameSync(staging, destDir);
  } catch (err) {
    if (previous && !fs.existsSync(destDir)) fs.renameSync(previous, destDir);
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  }
  if (previous) fs.rmSync(previous, { recursive: true, force: true });
  return true;
}

