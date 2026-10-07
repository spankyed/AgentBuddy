/**
 * Pack layout: the one layout every pack has everywhere — build output
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
import type { PackRegistry } from './registry.ts';

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
  return sha256(fs.readFileSync(filePath));
}

function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
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

/**
 * The loaded packs the renderer is told about, and where to fetch each one's frontend from.
 *
 * **Every pack, by the same rule.** The app's own pack is here with its `feEntry` like any other, because
 * nothing compiles a pack's frontend into the renderer any more: the shell fetches each one over `pack://`
 * from the bundle that pack's own `abuddy build` wrote. A pack with neither file is still listed — it has
 * systems the renderer must know are running — and the shell reads that as "no frontend code".
 */
export function getLoadedPackEntries(registry: Pick<PackRegistry, 'loadedPacks'>): LoadedPackEntry[] {
  return registry.loadedPacks().map(({ id, name, version, dir }) => {
    const { entry, styles } = packFrontendFiles(dir);
    // A pack with no frontend files at all was left out of this list entirely, and its systems were told
    // about the client by the bus instead. Listing it keeps one answer to "which packs are running" rather
    // than two that can disagree
    if (!entry && !styles) return { id, name, version };
    const feRevision = crypto.createHash('sha256')
      .update([entry, styles].flatMap((file) => (file ? [sha256File(path.join(dir, file))] : [])).join(':'))
      .digest('hex').slice(0, 16);
    return { id, name, version, feEntry: entry, feStyles: styles, feRevision };
  });
}

/**
 * The loaded packs with frontend code: the renderer loads each after connecting, from the entries above,
 * and their systems wait for that rather than for the client. The app's own pack is one of them now, its
 * frontend being fetched over `pack://` like any other.
 */
export function getPacksWithClientLoadedFrontends(registry: Pick<PackRegistry, 'loadedPacks'>): string[] {
  return registry.loadedPacks().filter((pack) => packFrontendFiles(pack.dir).entry).map((pack) => pack.id);
}

/**
 * The files a pack layout holds and their hashes, which is what `integrity.json` records — and so is
 * excluded from it.
 */
export function packFileHashes(layoutDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const rel of listFiles(layoutDir)) {
    if (rel === PACK_LAYOUT.integrity) continue;
    files[rel] = sha256File(path.join(layoutDir, rel));
  }
  return files;
}

/**
 * The files a staged pack *would* hold and their hashes, computed from the built pack without copying
 * anything: the sections' files under `dist/`, minus source maps, plus the manifest. Keyed by the path they
 * take in the staged layout.
 *
 * One declaration with `stagePack`, which writes exactly this into `integrity.json`. The boot that installs
 * the packs the app ships compares it against `packFileHashes` of the installed copy — the files as they
 * actually are, not as `integrity.json` remembers them, so one comparison answers both "is this a different
 * build" and "did something change the installed copy".
 */
export function stagedFileHashes(packRoot: string): Record<string, string> {
  const dist = path.join(packRoot, 'dist');
  const files: Record<string, string> = {};
  for (const section of SECTIONS) {
    const from = path.join(dist, section);
    if (!fs.existsSync(from)) continue;
    for (const rel of listFiles(from)) {
      if (rel.endsWith('.map')) continue;
      files[path.join(section, rel)] = sha256File(path.join(from, rel));
    }
  }
  // The manifest is staged re-serialised, so its hash is of what staging would write rather than of the file
  const manifest = fs.readFileSync(path.join(packRoot, PACK_LAYOUT.manifest), 'utf-8');
  files[PACK_LAYOUT.manifest] = sha256(JSON.stringify(JSON.parse(manifest), null, 2) + '\n');
  return files;
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

  const files = packFileHashes(stageDir);
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
export function readPackIntegrity(dir: string): PackIntegrity {
  const integrityPath = path.join(dir, PACK_LAYOUT.integrity);
  if (!fs.existsSync(integrityPath)) throw new Error(`Not a pack layout: no ${PACK_LAYOUT.integrity} in ${dir}`);
  return JSON.parse(fs.readFileSync(integrityPath, 'utf-8'));
}

/**
 * Why the AgentBuddy reading pack snapshot format `appFormat` (this process's by default, which in the app is the
 * app's) can't load the pack built into `dir` (a pack layout), or undefined when it can: its snapshot records the
 * format of the build (`PACK_SNAPSHOT_FORMAT`), which covers the registration its runtime exports as well as what
 * dependents read. `integrity.json`'s format can't say this: whoever stages a pack writes it, not whoever built it.
 */
export function buildFormatProblem(dir: string, appFormat: number = PACK_SNAPSHOT_FORMAT): string | undefined {
  const snapshotFile = path.join(dir, PACK_LAYOUT.snapshot);
  let snapshot: { format?: unknown; sdkVersion?: string };
  try {
    snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf-8'));
  } catch {
    return `${PACK_LAYOUT.snapshot} is missing or unreadable, so nothing says which abuddy built it: rebuild it with the abuddy CLI that matches this AgentBuddy`;
  }
  const mismatch = _snapshotFormatMismatch(snapshot, appFormat);
  if (!mismatch) return undefined;
  return `${mismatch.problem}; this AgentBuddy reads format ${appFormat}. `
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

/** A pack's compiled seed files, relative to the seeds directory holding them */
export function packSeedFiles(seedsDir: string): string[] {
  return fs.existsSync(seedsDir) ? listFiles(seedsDir).sort() : [];
}
