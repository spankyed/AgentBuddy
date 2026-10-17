/**
 * Pack layout: the one layout every pack has everywhere — build output
 * (dist/), the release archive, and the installed pack directory.
 *
 *   <id>/apack.json            the pack's manifest
 *   <id>/integrity.json            format version, versions, provenance, sha256 per file
 *   <id>/runtime/index.cjs      backend: exports `registration` + `setCompiledDir`
 *   <id>/runtime/fe.js, fe.css  frontend
 *   <id>/runtime/content/         compiled content
 *   <id>/build/                 build-time code dependents load (step build facets)
 *   <id>/types/snapshot.json    types + manifest for dependents' codegen
 *
 * `apack pack build` seals its output with the manifest and integrity.json. Staging verifies
 * that output and removes source maps. The installer copies a verified stage into
 * the packs directory unchanged, and the host loader reads it as-is.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as tar from 'tar';
import { isDeepStrictEqual } from 'node:util';
import { replaceDir } from '../replace-dir.ts';
import { parseSnapshot, parseContentIndex, contentFile, CONTENT_INDEX_FILE, _snapshotFormatMismatch, PACK_SNAPSHOT_FORMAT, type ContentIndex, type PackManifest, type PackSnapshot, type SnapshotFormatMismatch } from '@apackdev/sdk/build';
import type { PackRegistry } from './registry.ts';
import { PACK_LAYOUT, PACK_LAYOUT_VERSION, type PackIntegrity } from './layout-paths.ts';
import { readPackIntegrity, packBuildRevision } from './assets.ts';

export { PACK_LAYOUT, PACK_LAYOUT_VERSION, type PackIntegrity } from './layout-paths.ts';
export { readPackIntegrity, packBuildRevision, readPackAsset } from './assets.ts';

/** Sections `apack pack build` writes into dist/ and staging copies into the staged pack. */
const SECTIONS = [PACK_LAYOUT.runtimeDir, PACK_LAYOUT.buildDir, PACK_LAYOUT.typesDir] as const;

/** The accepted installed build: declarations and the complete file inventory verified together. */
export interface PackBuild {
  snapshot: PackSnapshot;
  integrity: PackIntegrity;
  /** Verified compiled inventory; absent when no content was compiled. */
  content?: ContentIndex;
  /** Content identity independent of file enumeration order and installation directory. */
  revision: string;
}

export function sha256File(filePath: string): string {
  return sha256(fs.readFileSync(filePath));
}

function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function listFiles(dir: string, base = dir, rejectLinks = false): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      if (rejectLinks) throw new Error(`Pack contains a symbolic link: ${path.relative(base, full)}`);
      continue;
    }
    if (entry.isDirectory()) out.push(...listFiles(full, base, rejectLinks));
    else {
      if (rejectLinks && !entry.isFile()) throw new Error(`Pack contains a nonregular file: ${path.relative(base, full)}`);
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
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
  /** Host-issued accepted runtime identity, independent of build content identity. */
  runtimeRevision: string;
  /** Declaration identity of the active backend; frontend bindings must match it. */
  declarationRevision: string;
  /** Accepted declarations of the active backend, used to validate frontend binding membership. */
  manifest?: PackManifest;
  /** Verified accepted build identity; native host registrations have no installed build. */
  buildRevision?: string;
  name: string;
  version: string;
  /** The pack's runtime/fe.js, when it has one */
  feEntry?: string;
  /** The pack's runtime/fe.css, when it has one */
  feStyles?: string;
  /** Explicit source delivery for apack pack dev; never used by an installed build request. */
  developmentBaseUrl?: string;
}

/** A pack's frontend files, pack-relative: its FE entry and stylesheet when `apack pack build` wrote them */
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
 * from the bundle that pack's own `apack pack build` wrote. A pack with neither file is still listed — it has
 * systems the renderer must know are running — and the shell reads that as "no frontend code".
 */
export function getLoadedPackEntries(registry: Pick<PackRegistry, 'loadedPacks' | 'getPackRuntime'>): LoadedPackEntry[] {
  return registry.loadedPacks().map(({ id, name, version, declarationRevision, buildRevision, buildFiles, manifest }) => {
    const runtime = registry.getPackRuntime(id);
    if (!runtime) throw new Error(`Pack "${id}" has no accepted runtime identity`);
    const runtimeRevision = runtime.runtimeRevision;
    const entry = buildFiles && Object.hasOwn(buildFiles, PACK_LAYOUT.feEntry) ? PACK_LAYOUT.feEntry : undefined;
    const styles = buildFiles && Object.hasOwn(buildFiles, PACK_LAYOUT.feStyles) ? PACK_LAYOUT.feStyles : undefined;
    // A pack with no frontend files at all was left out of this list entirely, and its systems were told
    // about the client by the bus instead. Listing it keeps one answer to "which packs are running" rather
    // than two that can disagree
    if (!entry && !styles) return { id, name, version, runtimeRevision, declarationRevision, buildRevision };
    if (!buildRevision) throw new Error(`Pack "${id}" frontend has no accepted build identity`);
    if (!manifest) throw new Error(`Pack "${id}" frontend has no accepted declarations`);
    return { id, name, version, runtimeRevision, declarationRevision, buildRevision, manifest: structuredClone(manifest), feEntry: entry, feStyles: styles };
  });
}

/**
 * The loaded packs with frontend code: the renderer loads each after connecting, from the entries above,
 * and their systems wait for that rather than for the client. The app's own pack is one of them now, its
 * frontend being fetched over `pack://` like any other.
 */
export function getPacksWithClientLoadedFrontends(registry: Pick<PackRegistry, 'loadedPacks' | 'getPackRuntime'>): string[] {
  return getLoadedPackEntries(registry).filter(pack => pack.feEntry).map(pack => pack.id);
}

/**
 * The files a pack layout holds and their hashes, which is what `integrity.json` records — and so is
 * excluded from it.
 */
export function packFileHashes(layoutDir: string): Record<string, string> {
  return Object.fromEntries(listFiles(layoutDir).filter(rel => rel !== PACK_LAYOUT.integrity)
    .map(rel => [rel, sha256File(path.join(layoutDir, rel))]));
}

/** Seal completed build output before publishing it as dist. Staging must never renew this receipt. */
export function sealPackBuild(dir: string, manifest: PackManifest, sdkVersion?: string): PackIntegrity {
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.manifest), JSON.stringify(manifest, null, 2) + '\n');
  const integrity: PackIntegrity = {
    formatVersion: PACK_LAYOUT_VERSION, id: manifest.id, version: manifest.version,
    hostVersion: manifest.hostVersion, sdkVersion, files: packFileHashes(dir),
  };
  fs.writeFileSync(path.join(dir, PACK_LAYOUT.integrity), JSON.stringify(integrity, null, 2) + '\n');
  return verifyPack(dir);
}

/** The installation variant excludes build source maps and carries the same manifest bytes. */
function stagedHashes(integrity: PackIntegrity): Record<string, string> {
  return Object.fromEntries(Object.entries(integrity.files).filter(([file]) =>
    file === PACK_LAYOUT.manifest || (!file.endsWith('.map') && SECTIONS.some(section => file.startsWith(`${section}/`)))));
}

/** Verify the producer's output and the source descriptor before computing a shipped update. */
export function stagedFileHashes(packRoot: string): Record<string, string> {
  return stagedHashes(readBuiltPackIntegrity(packRoot));
}

/** Capture a verified source declaration and its published files without executing or staging it. */
export function readBuiltPackSource(packRoot: string): { snapshot: PackSnapshot; files: Record<string, string>; sourceRevision: string } {
  const built = readBuiltPackIntegrity(packRoot, PACK_SNAPSHOT_FORMAT);
  const build = readPackBuild(path.join(packRoot, 'dist'));
  if (!isDeepStrictEqual(built, build.integrity)) {
    throw new Error('Built build changed while reading its source declarations; retry with the complete build');
  }
  const files = stagedHashes(built);
  return { snapshot: build.snapshot, files, sourceRevision: shippedPackRevision(files) };
}

/** Identity of published source files/layout; distinct from an installed receipt or runtime nonce. */
export function shippedPackRevision(files: Readonly<Record<string, string>>): string {
  return crypto.createHash('sha256').update(JSON.stringify({ layout: PACK_LAYOUT_VERSION,
    files: Object.keys(files).sort().map(file => [file, files[file]]),
  })).digest('hex');
}

function readBuiltPackIntegrity(packRoot: string, packFormat?: number): PackIntegrity {
  if (!hasBuiltPackSections(packRoot)) {
    throw new Error(`Pack at ${packRoot} is not built (missing dist/${PACK_LAYOUT.runtimeEntry} or dist/${PACK_LAYOUT.snapshot}). Run "apack pack build" first.`);
  }
  const manifest: PackManifest = JSON.parse(fs.readFileSync(path.join(packRoot, PACK_LAYOUT.manifest), 'utf8'));
  const dist = path.join(packRoot, 'dist');
  const { bytes, data } = readSnapshotFile(dist);
  // A foreign format remains opaque: its matching host owns the grammar.
  if (packFormat !== undefined) {
    const mismatch = _snapshotFormatMismatch(data, packFormat);
    if (mismatch) throw new Error(snapshotFormatProblem(mismatch, packFormat));
  }
  const snapshot = !_snapshotFormatMismatch(data) ? checkedSnapshot(data, manifest) : undefined;
  const integrity = verifyPack(dist);
  if (snapshot) {
    assertRequiredEntries(snapshot.manifest, integrity);
    readCompiledContent(dist, snapshot.manifest, integrity);
  }
  if (sha256(bytes) !== integrity.files[PACK_LAYOUT.snapshot]
    || sha256(JSON.stringify(manifest, null, 2) + '\n') !== integrity.files[PACK_LAYOUT.manifest]) {
    throw new Error('Source declarations do not match the sealed build; rebuild the complete pack');
  }
  return integrity;
}

/** Stage only verified producer bytes; retain the previous stage if validation or copying fails. */
export function stagePack(
  packRoot: string,
  stageDir: string,
  options: { sdkVersion?: string; provenance?: PackIntegrity['provenance']; packFormat?: number } = {},
): PackIntegrity {
  const built = readBuiltPackIntegrity(packRoot, options.packFormat);
  const integrity: PackIntegrity = {
    ...built, sdkVersion: options.sdkVersion ?? built.sdkVersion,
    provenance: options.provenance ?? built.provenance, files: stagedHashes(built),
  };
  fs.mkdirSync(path.dirname(stageDir), { recursive: true });
  const incoming = fs.mkdtempSync(path.join(path.dirname(stageDir), '.apack-stage-'));
  try {
    const dist = path.join(packRoot, 'dist');
    for (const file of Object.keys(integrity.files)) {
      const target = path.join(incoming, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(dist, file), target);
    }
    fs.writeFileSync(path.join(incoming, PACK_LAYOUT.integrity), JSON.stringify(integrity, null, 2) + '\n');
    // Copy races cannot be re-signed into acceptance: keep the producer's expected checksums.
    verifyPack(incoming);
    replaceDir(incoming, stageDir);
    return integrity;
  } finally {
    fs.rmSync(incoming, { recursive: true, force: true });
  }
}

/** Read installed declarations without loading code; refuse changed, missing or additional files. */
export function readPackBuild(dir: string): PackBuild {
  const { bytes: snapshotBytes, data } = readSnapshotFile(dir);
  const manifestBytes = fs.readFileSync(path.join(dir, PACK_LAYOUT.manifest));
  const snapshot = checkedSnapshot(data, JSON.parse(manifestBytes.toString('utf8')));
  const integrity = verifyPack(dir);
  assertRequiredEntries(snapshot.manifest, integrity);
  const content = readCompiledContent(dir, snapshot.manifest, integrity);
  for (const [file, bytes] of [[PACK_LAYOUT.snapshot, snapshotBytes], [PACK_LAYOUT.manifest, manifestBytes]] as const) {
    if (sha256(bytes) !== integrity.files[file]) throw new Error('Captured declarations do not match the verified build; retry with the complete pack');
  }
  const revision = packBuildRevision(integrity);
  return { snapshot, integrity, revision, ...(content && { content }) };
}

/** Capture indexed data against the same receipt as its owning declarations, without loading compilers. */
function readCompiledContent(dir: string, manifest: PackManifest, integrity: PackIntegrity): ContentIndex | undefined {
  const sources = manifest.content?.sources ?? {};
  const datasets = manifest.content?.datasets ?? {};
  const indexFile = `${PACK_LAYOUT.contentDir}/${CONTENT_INDEX_FILE}`;
  if (!Object.hasOwn(integrity.files, indexFile)) {
    if (Object.keys(sources).length || Object.keys(datasets).length) {
      throw new Error(`Pack "${manifest.id}" is missing its declared compiled content index; rebuild the complete pack`);
    }
    return;
  }
  const bytes = fs.readFileSync(path.join(dir, indexFile));
  if (sha256(bytes) !== integrity.files[indexFile]) throw new Error(`Captured content index does not match the verified build for "${manifest.id}"`);
  const index = parseContentIndex(JSON.parse(bytes.toString('utf8')));
  if (index.packId !== manifest.id) throw new Error(`Content index belongs to "${index.packId}", not "${manifest.id}"`);
  const expected = new Map<string, boolean>();
  for (const [key, entry] of Object.entries(sources)) {
    // Applier-only sources read their own data; sources with a path/format are compiled and indexed.
    if (typeof entry === 'string' || entry.path !== undefined || entry.format !== undefined) expected.set(key, true);
  }
  for (const key of Object.keys(datasets)) expected.set(key, false);
  for (const entry of index.entries) {
    if (!expected.has(entry.key)) throw new Error(`Content index for "${manifest.id}" includes undeclared compiled entry "${entry.key}"`);
    if (entry.written !== expected.get(entry.key)) throw new Error(`Content index for "${manifest.id}" has the wrong written policy for "${entry.key}"`);
    const file = `${PACK_LAYOUT.contentDir}/${contentFile(entry.key)}`;
    if (!Object.hasOwn(integrity.files, file)) throw new Error(`Pack "${manifest.id}" is missing required compiled content file ${file}`);
    expected.delete(entry.key);
  }
  if (expected.size) throw new Error(`Content index for "${manifest.id}" is missing declared compiled entries: ${[...expected.keys()].join(', ')}`);
  return index;
}

/** Required bindings are not optional just because an incomplete producer omitted them from its receipt. */
function assertRequiredEntries(manifest: PackManifest, integrity: PackIntegrity): void {
  // Match the contributions emitted by generateFrontendEntry; inline data alone needs no frontend.
  const frontend = Object.values(manifest.features ?? {}).some(feature =>
    feature.plugin || feature.designation || feature.settings?.form || feature.references)
    || Object.values(manifest.extensions?.settings ?? {}).some(definition => definition.form)
    || (['steps', 'artifacts', 'blocks', 'tiptapPlugins', 'appExtensions'] as const)
      .some(kind => Object.keys(manifest.extensions?.[kind] ?? {}).length > 0);
  for (const file of [PACK_LAYOUT.runtimeEntry, ...(frontend ? [PACK_LAYOUT.feEntry] : [])]) {
    if (!Object.hasOwn(integrity.files, file)) {
      throw new Error(`Pack "${manifest.id}" is missing required ${file}; rebuild the complete pack${file === PACK_LAYOUT.feEntry ? ' without --skip-fe' : ''}`);
    }
  }
}

function checkedSnapshot(raw: unknown, manifest: unknown): PackSnapshot {
  const mismatch = _snapshotFormatMismatch(raw);
  if (mismatch) throw new Error(snapshotFormatProblem(mismatch, PACK_SNAPSHOT_FORMAT));
  const result = parseSnapshot(raw);
  if (!result.snapshot) throw new Error(result.diagnostics.map(issue => issue.message).join('; '));
  if (!isDeepStrictEqual(manifest, result.snapshot.manifest)) {
    throw new Error('its manifest does not match its built declarations; rebuild and install the complete pack');
  }
  return result.snapshot;
}

function readSnapshotFile(dir: string): { bytes: Buffer; data: unknown } {
  try {
    const bytes = fs.readFileSync(path.join(dir, PACK_LAYOUT.snapshot));
    return { bytes, data: JSON.parse(bytes.toString('utf8')) };
  }
  catch {
    throw new Error(`${PACK_LAYOUT.snapshot} is missing or unreadable, so nothing says which apack built it: rebuild it with the apack CLI that matches this apack`);
  }
}

function snapshotFormatProblem(mismatch: SnapshotFormatMismatch, appFormat: number): string {
  return `${mismatch.problem}; this apack reads format ${appFormat}. `
    + (mismatch.newer ? 'Update apack to use it' : 'Rebuild it with the apack CLI that matches this apack');
}

/** Why an installed build cannot be read, before any executable module is loaded. */
export function packBuildProblem(dir: string, appFormat: number = PACK_SNAPSHOT_FORMAT): { kind: 'format' | 'declarations' | 'unreadable'; message: string } | undefined {
  try {
    const raw = readSnapshotFile(dir).data;
    const mismatch = _snapshotFormatMismatch(raw, appFormat);
    if (mismatch) return { kind: 'format', message: snapshotFormatProblem(mismatch, appFormat) };
    // A matching foreign format is opaque to this CLI; its app interprets the grammar.
    if (appFormat !== PACK_SNAPSHOT_FORMAT) return undefined;
    try {
      const snapshot = checkedSnapshot(raw, JSON.parse(fs.readFileSync(path.join(dir, PACK_LAYOUT.manifest), 'utf-8')));
      const integrity = readPackIntegrity(dir);
      assertRequiredEntries(snapshot.manifest, integrity);
      readCompiledContent(dir, snapshot.manifest, integrity);
      return undefined;
    } catch (error) { return { kind: 'declarations', message: (error as Error).message }; }
  }
  catch (error) { return { kind: 'unreadable', message: (error as Error).message }; }
}

/** Check format version and that the files on disk are exactly the ones recorded. */
export function verifyPack(dir: string): PackIntegrity {
  const receipt = fs.lstatSync(path.join(dir, PACK_LAYOUT.integrity), { throwIfNoEntry: false });
  if (!receipt) throw new Error(`Not a pack layout: no ${PACK_LAYOUT.integrity} in ${dir}; rebuild the complete pack`);
  if (receipt.isSymbolicLink()) throw new Error('integrity.json must be a file, not a symbolic link');
  if (!receipt.isFile()) throw new Error('integrity.json must be a regular file');
  const integrity = readPackIntegrity(dir);
  if (!integrity || typeof integrity !== 'object' || Array.isArray(integrity)
    || typeof integrity.id !== 'string' || !integrity.id
    || typeof integrity.version !== 'string' || !integrity.version
    || typeof integrity.formatVersion !== 'number' || !Number.isFinite(integrity.formatVersion)
    || !integrity.files || typeof integrity.files !== 'object' || Array.isArray(integrity.files)) {
    throw new Error('Invalid integrity.json: expected layout version, pack id/version and file checksums');
  }
  if (integrity.formatVersion !== PACK_LAYOUT_VERSION) {
    throw new Error(`Pack ${integrity.id} uses format ${integrity.formatVersion}; this host supports format ${PACK_LAYOUT_VERSION}. Update apack or rebuild the pack.`);
  }
  const problems: string[] = [];
  let manifestBytes: Buffer | undefined;
  const onDisk = new Set(listFiles(dir, dir, true).filter(f => f !== PACK_LAYOUT.integrity));
  for (const [rel, expected] of Object.entries(integrity.files)) {
    if (!rel || rel.includes('\\') || rel.split('/').some(part => !part || part === '.' || part === '..')
      || rel === PACK_LAYOUT.integrity || typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) {
      problems.push(`invalid checksum entry ${rel}`);
      continue;
    }
    if (!onDisk.has(rel)) problems.push(`missing ${rel}`);
    else {
      const bytes = fs.readFileSync(path.join(dir, rel));
      if (sha256(bytes) !== expected) problems.push(`checksum mismatch ${rel}`);
      if (rel === PACK_LAYOUT.manifest) manifestBytes = bytes;
    }
    onDisk.delete(rel);
  }
  for (const extra of onDisk) problems.push(`unexpected ${extra}`);
  if (problems.length > 0) {
    throw new Error(`Pack ${integrity.id}@${integrity.version} failed verification:\n${problems.map(p => `  - ${p}`).join('\n')}`);
  }
  if (!manifestBytes) throw new Error(`Pack is missing ${PACK_LAYOUT.manifest}`);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (integrity.id !== manifest?.id || integrity.version !== manifest?.version) {
    throw new Error('integrity.json identity does not match its manifest; rebuild and install the complete pack');
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

/** A pack's compiled content files, relative to the content directory holding them */
export function packContentFiles(contentDir: string): string[] {
  return fs.existsSync(contentDir) ? listFiles(contentDir).sort() : [];
}

/**
 * The newest source file a pack's build should have seen, when that file is newer than the build — or
 * nothing when the build is current.
 *
 * **Absence is no longer the signal that a build failed**, which is why this is here rather than in the one
 * caller it started with. `apack pack build` assembles its output aside and renames it over `dist`, so a failed
 * build leaves the previous one in place; every reader that took a missing tree to mean "nothing to use" has
 * to ask this instead. Two do: `apack pack archive`, which would otherwise ship the build before the one that
 * failed, and `apack pack test --prebuilt`, which trusts a build it did not make.
 *
 * Sources are the pack's `src/` and its `apack.json`; the build is the oldest of the two files the installer
 * requires, since a build is only as current as its least finished part. mtimes are what a build leaves
 * behind, so this is the same question `packages-built.ts` asks of the workspace packages and the same
 * answer: it can only be wrong in the safe direction, reporting stale for a file touched without being
 * changed. A rename preserves the mtime of the file as it was written, so staging does not disturb it.
 */
export function staleBuildOutput(packDir: string): string | undefined {
  // `PACK_LAYOUT` is relative to a layout directory, which for a pack's own build output is `dist`
  const built = [PACK_LAYOUT.runtimeEntry, PACK_LAYOUT.snapshot].map((file) => path.join(packDir, 'dist', file));
  const builtAt = built.map((file) => (fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0));
  // Absent rather than stale: the caller's own "not built" message names the files and the command
  if (builtAt.some((at) => at === 0)) return undefined;
  const oldestBuilt = Math.min(...builtAt);

  let newest: { file: string; at: number } | undefined;
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // `__generated__` is written by the build itself, so it is output wearing a source file's path
      if (entry.name === '__generated__' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const at = fs.statSync(full).mtimeMs;
        if (!newest || at > newest.at) newest = { file: path.relative(packDir, full), at };
      }
    }
  };
  const src = path.join(packDir, 'src');
  if (fs.existsSync(src)) walk(src);
  const manifest = path.join(packDir, PACK_LAYOUT.manifest);
  const manifestAt = fs.existsSync(manifest) ? fs.statSync(manifest).mtimeMs : 0;
  if (manifestAt > (newest?.at ?? 0)) newest = { file: PACK_LAYOUT.manifest, at: manifestAt };

  return newest && newest.at > oldestBuilt ? newest.file : undefined;
}
