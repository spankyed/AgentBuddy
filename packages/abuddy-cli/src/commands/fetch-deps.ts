import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { satisfies, rcompare, clean } from 'semver';
import { SEED_INDEX_FILE, _snapshotFormatMismatch, type PackSnapshot } from '@abuddy/sdk/build';
import { findPackRoot, readManifest } from '../utils';
import { PACK_LAYOUT, extractPackArchive, verifyPack } from '@abuddy/host/packs';
import { resolveAppContext, type AppEnv } from '@abuddy/sdk/env';
import { configuredAppPackagesDir } from '../app/app-target';

// ── Dependency value parsing ──

interface DepSource {
  github: string | null;    // "owner/repo" or null
  filePath: string | null;  // local filesystem path or null
  range: string;            // semver range, e.g. ">=0.1.0"
}

function parseDepValue(value: string): DepSource {
  if (value.startsWith('file:')) {
    return { github: null, filePath: value.slice('file:'.length).trim(), range: '*' };
  }
  if (value.startsWith('github:')) {
    const rest = value.slice('github:'.length).trim();
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) {
      return { github: rest, filePath: null, range: '*' };
    }
    return { github: rest.slice(0, spaceIdx), filePath: null, range: rest.slice(spaceIdx + 1).trim() };
  }
  return { github: null, filePath: null, range: value };
}

// ── Files discovery ──

/** A dependency's files: its snapshot, plus build code and a backend runtime when it ships them. */
export interface DepFiles {
  snapshot: PackSnapshot;
  /** Directory with the dependency's build-time code (build/steps.build.mjs, build/seed-compilers.mjs), if present. */
  buildDir?: string;
  /** The dependency's backend runtime (runtime/index.cjs), if present: what a dependent's tests load. */
  runtimeEntry?: string;
  /** The compiled seeds its runtime reads (runtime/seeds/, or a built-in pack's dist/), with the runtime */
  seedsDir?: string;
}

function tryReadSnapshot(filePath: string): PackSnapshot | null {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return null;
}

/**
 * Find artifacts in a pack directory in any layout: an installed or extracted bundle
 * (types/, build/), an external pack source built in the pack layout (dist/types,
 * dist/build), or a built-in pack's dist/ (dist/snapshot.json).
 */
export function findDepFiles(dir: string): DepFiles | null {
  const candidates = [
    { root: dir, snapshot: path.join(dir, 'types', 'snapshot.json') },
    { root: path.join(dir, 'dist'), snapshot: path.join(dir, 'dist', 'types', 'snapshot.json') },
    // A built-in pack's dist: its snapshot at the top, build/ and runtime/ in the pack layout
    { root: path.join(dir, 'dist'), snapshot: path.join(dir, 'dist', 'snapshot.json') },
    // .abuddy/deps/<id>/ cache
    { root: dir, snapshot: path.join(dir, 'snapshot.json') },
  ];
  for (const c of candidates) {
    const snapshot = tryReadSnapshot(c.snapshot);
    if (snapshot) return withBuildAndRuntime(snapshot, c.root);
  }
  return null;
}

/** The snapshot plus the build dir, runtime entry and its seeds under `root`, where they exist */
function withBuildAndRuntime(snapshot: PackSnapshot, root: string): DepFiles {
  const buildDir = path.join(root, PACK_LAYOUT.buildDir);
  const runtimeEntry = path.join(root, PACK_LAYOUT.runtimeEntry);
  // An installed pack's seeds are under runtime/; a built-in pack's dist keeps them at its top
  const seedsDir = [path.join(root, PACK_LAYOUT.seedsDir), root].find((dir) => fs.existsSync(path.join(dir, SEED_INDEX_FILE)));
  const hasRuntime = fs.existsSync(runtimeEntry);
  return {
    snapshot,
    ...(fs.existsSync(buildDir) && { buildDir }),
    ...(hasRuntime && { runtimeEntry }),
    ...(hasRuntime && seedsDir && { seedsDir }),
  };
}

// ── Local cache ──

function depCacheDir(root: string, depId: string): string {
  return path.join(root, '.abuddy', 'deps', depId);
}

function resolveFromLocal(root: string, depId: string): DepFiles | null {
  const dir = depCacheDir(root, depId);
  const snapshot = tryReadSnapshot(path.join(dir, 'snapshot.json'));
  return snapshot && withBuildAndRuntime(snapshot, dir);
}

// ── Workspace resolution ──

/**
 * A dependency in a directory the pack sits under: a workspace package (`<ancestor>/packages/<depId>`)
 * or a sibling checkout (`<ancestor>/<depId>`). The nearest ancestor wins, so a pack at any depth
 * inside an AgentBuddy checkout (a test fixture, say) builds against that checkout's packages rather
 * than an installed app's older copy.
 */
function resolveFromWorkspace(root: string, depId: string): DepFiles | null {
  for (let dir = path.dirname(path.resolve(root)); ; dir = path.dirname(dir)) {
    const result = findDepFiles(path.join(dir, 'packages', depId)) ?? findDepFiles(path.join(dir, depId));
    if (result) return result;
    if (path.dirname(dir) === dir) return null;
  }
}

// ── Installed app resolution ──

/** Whether a resolved dependency's version satisfies the range abuddy.json declares. */
function inRange(artifacts: DepFiles, range: string): boolean {
  if (!range || range === '*') return true;
  const version = clean(artifacts.snapshot.manifest?.version ?? '');
  return version !== null && satisfies(version, range, { includePrerelease: true });
}

/**
 * Each build that was found but that this CLI can't generate against, with why. A dependency that exists
 * and still fails to resolve says so with these, rather than as not found.
 */
type Rejected = string[];

/**
 * Whether a found build is one this pack can use: in the declared range, and in the snapshot format this
 * CLI reads. The format is a selection criterion like the range, so a mismatched installed channel or
 * cache entry gives way to one that matches instead of being generated against.
 */
function usable(found: DepFiles | null, range: string, where: string, rejected: Rejected): found is DepFiles {
  if (!found) return false;
  const mismatch = _snapshotFormatMismatch(found.snapshot);
  if (mismatch) {
    rejected.push(`${where}: ${mismatch}`);
    return false;
  }
  return inRange(found, range);
}

function unusable(depId: string, rejected: Rejected): Error {
  return new Error(`Dependency "${depId}" has no build this CLI can use:\n${rejected.map((r) => `  - ${r}`).join('\n')}`);
}

/** Built-in packs published by an installed AgentBuddy (any channel) into its data dir at boot. */
function resolveFromInstalledApp(depId: string, range: string, rejected: Rejected): (DepFiles & { env: AppEnv }) | null {
  for (const env of ['production', 'beta', 'development', 'test'] as const) {
    const found = findDepFiles(path.join(resolveAppContext({ env }).hostPacksDir, depId));
    if (usable(found, range, `installed app (${env})`, rejected)) return { ...found, env };
  }
  return null;
}

/** Built-in packs of the app configured for `abuddy test` (a checkout or a downloaded beta). */
async function resolveFromConfiguredApp(root: string, depId: string): Promise<(DepFiles & { label: string }) | null> {
  let hostVersion: string | undefined;
  try { hostVersion = readManifest(root).hostVersion; } catch {}
  const app = await configuredAppPackagesDir({ hostVersion });
  if (!app) return null;
  const found = findDepFiles(path.join(app.dir, depId));
  return found && { ...found, label: app.label };
}

// ── File path resolution ──

function resolveFromFile(root: string, filePath: string): DepFiles | null {
  return findDepFiles(path.resolve(root, filePath));
}

// ── GitHub release resolution ──

export interface GitHubRelease {
  tag_name: string;
  assets: Array<{ name: string; url: string }>;
}

/**
 * The newest release whose tag satisfies `range`.
 *
 * `includePrerelease`, as the local resolution check does (`inRange`): a dependency range is on the pack,
 * not on a release channel, so `*` has to match a `v0.2.0-beta.0` an author published on purpose. Without
 * it, semver treats every prerelease as out of range and a pack whose only releases are betas resolves to
 * nothing.
 */
export function pickRelease(releases: GitHubRelease[], range: string): { release: GitHubRelease; version: string } | null {
  const matching = releases
    .map(r => ({ release: r, version: tagToVersion(r.tag_name) }))
    .filter((r): r is { release: GitHubRelease; version: string } =>
      r.version !== null && satisfies(r.version, range, { includePrerelease: true }))
    .sort((a, b) => rcompare(a.version, b.version));
  return matching[0] ?? null;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'abuddy-cli',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function tagToVersion(tag: string): string | null {
  return clean(tag.replace(/^v/, ''));
}

async function resolveFromGitHub(root: string, depId: string, repo: string, range: string, rejected: Rejected): Promise<DepFiles | null> {
  const url = `https://api.github.com/repos/${repo}/releases?per_page=100`;

  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    if (res.status === 404) console.warn(`  GitHub repo not found: ${repo}`);
    else console.warn(`  GitHub API error (${res.status}) for ${repo}`);
    return null;
  }

  const picked = pickRelease(await res.json() as GitHubRelease[], range);
  if (!picked) {
    console.warn(`  No release matching "${range}" in ${repo}`);
    return null;
  }
  const { release, version } = picked;

  // abuddy pack names the archive <id>-<version>.tgz and publishes its .sha256 next to it
  const asset = release.assets.find(a => a.name === `${depId}-${version}.tgz`);
  if (!asset) {
    console.warn(`  Release ${release.tag_name} in ${repo} has no ${depId}-${version}.tgz asset`);
    return null;
  }
  const checksumAsset = release.assets.find(a => a.name === `${asset.name}.sha256`);
  if (!checksumAsset) {
    console.warn(`  Release ${release.tag_name} in ${repo} has no ${asset.name}.sha256; refusing an unverifiable download`);
    return null;
  }

  return downloadAndExtract(root, asset, checksumAsset, depId, version, rejected);
}

async function downloadAsset(assetUrl: string, dest: string): Promise<boolean> {
  const headers = { ...githubHeaders(), 'Accept': 'application/octet-stream' };
  const res = await fetch(assetUrl, { headers });
  if (!res.ok || !res.body) {
    console.warn(`  Failed to download asset (${res.status})`);
    return false;
  }
  const nodeStream = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
  await pipeline(nodeStream, fs.createWriteStream(dest));
  return true;
}

async function downloadAndExtract(
  root: string,
  asset: { name: string; url: string },
  checksumAsset: { name: string; url: string },
  depId: string,
  version: string,
  rejected: Rejected,
): Promise<DepFiles | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-fetch-'));
  try {
    const archive = path.join(tmpDir, asset.name);
    if (!await downloadAsset(asset.url, archive)) return null;

    const checksumFile = path.join(tmpDir, checksumAsset.name);
    if (!await downloadAsset(checksumAsset.url, checksumFile)) return null;
    const sha256 = fs.readFileSync(checksumFile, 'utf-8').trim().split(/\s+/)[0];

    const extracted = await extractPackArchive(archive, path.join(tmpDir, 'extracted'), sha256);
    const bundle = verifyPack(extracted);
    if (bundle.id !== depId) {
      console.warn(`  ${asset.name} contains pack "${bundle.id}", not ${depId}`);
      return null;
    }
    const artifacts = findDepFiles(extracted);
    if (!artifacts) {
      console.warn(`  No snapshot found in ${asset.name} for ${depId}@${version}`);
      return null;
    }
    // Checked before caching, so a release this CLI can't read never replaces a cached one it can
    if (!usable(artifacts, '*', `github release ${version}`, rejected)) return null;
    // The temp dir is removed below; persist into the cache first
    cacheDep(root, depId, artifacts);
    return resolveFromLocal(root, depId);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── abuddy.com registry (stub) ──

async function lookupRegistry(_depId: string): Promise<string | null> {
  // TODO: implement when api.abuddy.com is live
  // const res = await fetch(`https://api.abuddy.com/packs/${depId}`);
  // if (!res.ok) return null;
  // const data = await res.json() as { github?: string };
  // return data.github ?? null;
  return null;
}

// ── Cache ──

function cacheDep(root: string, depId: string, artifacts: DepFiles): void {
  const depDir = depCacheDir(root, depId);
  const { snapshot, buildDir, runtimeEntry, seedsDir } = artifacts;
  fs.mkdirSync(depDir, { recursive: true });
  fs.writeFileSync(path.join(depDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2));

  const defsDir = path.join(depDir, 'defs');
  fs.rmSync(defsDir, { recursive: true, force: true });
  if (Object.keys(snapshot.defs).length > 0) {
    fs.mkdirSync(defsDir, { recursive: true });
    for (const [key, content] of Object.entries(snapshot.defs)) {
      fs.writeFileSync(path.join(defsDir, `${key}.d.ts`), content);
    }
  }

  const cachedBuild = path.join(depDir, 'build');
  if (buildDir && path.resolve(buildDir) !== path.resolve(cachedBuild)) {
    fs.rmSync(cachedBuild, { recursive: true, force: true });
    fs.cpSync(buildDir, cachedBuild, { recursive: true });
  } else if (!buildDir) {
    fs.rmSync(cachedBuild, { recursive: true, force: true });
  }

  // The backend runtime entry and the compiled seeds it reads; a dependency's FE bundle isn't used
  const cachedRuntime = path.join(depDir, PACK_LAYOUT.runtimeEntry);
  if (runtimeEntry && path.resolve(runtimeEntry) !== path.resolve(cachedRuntime)) {
    fs.rmSync(path.join(depDir, PACK_LAYOUT.runtimeDir), { recursive: true, force: true });
    fs.mkdirSync(path.dirname(cachedRuntime), { recursive: true });
    fs.copyFileSync(runtimeEntry, cachedRuntime);
    if (seedsDir) copySeeds(seedsDir, path.join(depDir, PACK_LAYOUT.seedsDir));
  } else if (!runtimeEntry) {
    fs.rmSync(path.join(depDir, PACK_LAYOUT.runtimeDir), { recursive: true, force: true });
  }
}

/** Copies compiled seeds (`*.seed.json`, `seeds.json`, `media/`) without the rest of a built-in pack's dist */
function copySeeds(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name.endsWith('.seed.json') || entry.name === SEED_INDEX_FILE)) {
      fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
    } else if (entry.isDirectory() && entry.name === 'media') {
      fs.cpSync(path.join(from, entry.name), path.join(to, entry.name), { recursive: true });
    }
  }
}

// ── Resolution chain ──

/**
 * Sources on this machine, in order: the workspace, the app configured for `abuddy test`
 * (ABUDDY_APP, ABUDDY_ROOT or the saved choice), then installed apps. Each must satisfy the
 * declared range. They're cheap, so they're re-read on every build instead of trusting the cache.
 */
async function resolveFromMachine(root: string, depId: string, range: string, rejected: Rejected): Promise<(DepFiles & { resolvedFrom: string }) | null> {
  const workspace = resolveFromWorkspace(root, depId);
  if (usable(workspace, range, 'workspace', rejected)) return { ...workspace, resolvedFrom: 'workspace' };

  const configured = await resolveFromConfiguredApp(root, depId);
  if (configured && usable(configured, range, configured.label, rejected)) {
    const { label, ...artifacts } = configured;
    return { ...artifacts, resolvedFrom: label };
  }

  const installed = resolveFromInstalledApp(depId, range, rejected);
  if (installed) {
    const { env, ...artifacts } = installed;
    return { ...artifacts, resolvedFrom: `installed app (${env})` };
  }
  return null;
}

async function resolveFromNetwork(root: string, depId: string, github: string | null, range: string, rejected: Rejected): Promise<(DepFiles & { resolvedFrom: string }) | null> {
  if (github) {
    const found = await resolveFromGitHub(root, depId, github, range, rejected);
    return found && { ...found, resolvedFrom: `github:${github}@${found.snapshot.manifest.version}` };
  }
  const registrySource = await lookupRegistry(depId);
  if (registrySource) {
    const found = await resolveFromGitHub(root, depId, registrySource, range, rejected);
    if (found) return { ...found, resolvedFrom: `registry → github:${registrySource}@${found.snapshot.manifest.version}` };
  }
  return null;
}

async function resolveFromUpstream(root: string, depId: string, depValue: string, rejected: Rejected): Promise<(DepFiles & { resolvedFrom: string }) | null> {
  const { github, filePath, range } = parseDepValue(depValue);

  if (filePath) {
    const found = resolveFromFile(root, filePath);
    const where = `file:${path.resolve(root, filePath)}`;
    if (usable(found, range, where, rejected)) return { ...found, resolvedFrom: where };
    if (!found) console.warn(`  Warning: no snapshot in ${path.resolve(root, filePath)} (build it first)`);
    return null;
  }

  return (await resolveFromMachine(root, depId, range, rejected)) ?? resolveFromNetwork(root, depId, github, range, rejected);
}

/**
 * A resolved dependency, with where it came from when that is known.
 *
 * The label is the one `abuddy fetch-deps` prints (`workspace`, `file:<path>`, `installed app (env)`,
 * `github:<owner>/<repo>@<version>`). It is per-resolution, not a property of the artifact — the same
 * bundle is a workspace sibling to its author and a GitHub release to everyone else — so it is not
 * recorded in the snapshot, which ships inside the pack.
 */
export type ResolvedDepFiles = DepFiles & { resolvedFrom?: string };

const withSource = (artifacts: DepFiles | null, resolvedFrom: string): ResolvedDepFiles | null =>
  artifacts && { ...artifacts, resolvedFrom };

/**
 * Resolve a dependency's artifacts (snapshot, plus build code and backend runtime when it ships them). Sources on this machine
 * win and refresh the .abuddy/deps cache; the cache only stands in for a network source, and
 * only while it satisfies the declared range. A dependency found only in builds this CLI can't use throws,
 * naming each one and why.
 */
export async function resolveDepFiles(root: string, depId: string, depValue: string, skipCache = false): Promise<ResolvedDepFiles | null> {
  const { github, filePath, range } = parseDepValue(depValue);
  const rejected: Rejected = [];
  if (filePath) {
    const found = await resolveFromUpstream(root, depId, depValue, rejected);
    if (!found && rejected.length > 0) throw unusable(depId, rejected);
    return found ?? null;
  }

  const local = await resolveFromMachine(root, depId, range, rejected);
  if (local) {
    cacheDep(root, depId, local);
    return withSource(resolveFromLocal(root, depId), local.resolvedFrom);
  }

  // A cache hit carries no source: cacheDep writes the snapshot, defs, build code and runtime, and
  // nothing about where they came from. Recording provenance in .abuddy/deps would cover this, and
  // isn't worth a new cache artifact until a hedged message proves annoying in practice.
  if (!skipCache) {
    const cached = resolveFromLocal(root, depId);
    if (usable(cached, range, 'the .abuddy/deps cache', rejected)) return cached;
  }

  const fetched = await resolveFromNetwork(root, depId, github, range, rejected);
  if (!fetched && rejected.length > 0) throw unusable(depId, rejected);
  if (!fetched) return null;
  cacheDep(root, depId, fetched);
  return withSource(resolveFromLocal(root, depId), fetched.resolvedFrom);
}

export async function resolveDep(root: string, depId: string, depValue: string, skipCache = false): Promise<PackSnapshot | null> {
  return (await resolveDepFiles(root, depId, depValue, skipCache))?.snapshot ?? null;
}

// ── Command ──

export async function fetchDeps(_args: string[]) {
  const root = findPackRoot(process.cwd());
  const manifest = readManifest(root);

  const deps = manifest.dependencies ?? {};
  const depIds = Object.keys(deps);

  if (depIds.length === 0) {
    console.log('No dependencies declared.');
    return;
  }

  console.log(`Fetching ${depIds.length} dependency snapshot(s)...`);

  let resolved = 0;
  const failed: string[] = [];

  for (const depId of depIds) {
    const depValue = deps[depId];
    const rejected: Rejected = [];
    const result = await resolveFromUpstream(root, depId, depValue, rejected);
    if (result) {
      if (!depValue.startsWith('file:')) cacheDep(root, depId, result);
      const entityCount = Object.keys(result.snapshot.types.entities).length;
      const relCount = Object.keys(result.snapshot.types.relKinds).length;
      const defCount = Object.keys(result.snapshot.defs).length;
      console.log(`  ${depId}: ${entityCount} entities, ${relCount} relKinds, ${defCount} def(s) (${result.resolvedFrom})`);
      resolved++;
    } else {
      failed.push(depId);
      if (rejected.length > 0) console.warn(unusable(depId, rejected).message);
    }
  }

  if (failed.length > 0) {
    console.warn(`\nFailed to resolve: ${failed.join(', ')}`);
    console.warn('Check the dependency value in abuddy.json (e.g. "github:owner/repo >=0.1.0").');
  }

  console.log(`\nResolved ${resolved}/${depIds.length} dependencies`);
}
