import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { satisfies, rcompare, clean } from 'semver';
import type { PackSnapshot } from '@abuddy/sdk/build';
import { findPackRoot, readManifest } from '../utils';
import { extractBundleArchive } from '@abuddy/sdk/packs';
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

// ── Artifact discovery ──

/** A dependency's build-time artifacts: its snapshot, plus step build code when it ships any. */
export interface DepArtifacts {
  snapshot: PackSnapshot;
  /** Directory with the dependency's build-time code (build/steps.build.mjs), if present. */
  buildDir?: string;
}

function tryReadSnapshot(filePath: string): PackSnapshot | null {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return null;
}

/**
 * Find artifacts in a pack directory in any layout: an installed or extracted bundle
 * (types/, build/), an external pack source built in the bundle layout (dist/types,
 * dist/build), or a built-in / pre-bundle pack (dist/snapshot.json).
 */
export function findDepArtifacts(dir: string): DepArtifacts | null {
  const candidates = [
    { snapshot: path.join(dir, 'types', 'snapshot.json'), build: path.join(dir, 'build') },
    { snapshot: path.join(dir, 'dist', 'types', 'snapshot.json'), build: path.join(dir, 'dist', 'build') },
    { snapshot: path.join(dir, 'dist', 'snapshot.json'), build: path.join(dir, 'dist', 'build') },
    // .abuddy/deps/<id>/ cache
    { snapshot: path.join(dir, 'snapshot.json'), build: path.join(dir, 'build') },
  ];
  for (const c of candidates) {
    const snapshot = tryReadSnapshot(c.snapshot);
    if (snapshot) return { snapshot, buildDir: fs.existsSync(c.build) ? c.build : undefined };
  }
  return null;
}

// ── Local cache ──

function depCacheDir(root: string, depId: string): string {
  return path.join(root, '.abuddy', 'deps', depId);
}

function resolveFromLocal(root: string, depId: string): DepArtifacts | null {
  const dir = depCacheDir(root, depId);
  const snapshot = tryReadSnapshot(path.join(dir, 'snapshot.json'));
  if (!snapshot) return null;
  const buildDir = path.join(dir, 'build');
  return { snapshot, buildDir: fs.existsSync(buildDir) ? buildDir : undefined };
}

// ── Workspace resolution ──

function resolveFromWorkspace(root: string, depId: string): DepArtifacts | null {
  const candidates = [
    path.resolve(root, '..', depId),
    path.resolve(root, '..', '..', 'packages', depId),
    path.resolve(root, '..', '..', depId),
  ];

  for (const candidate of candidates) {
    const result = findDepArtifacts(candidate);
    if (result) return result;
  }
  return null;
}

// ── Installed app resolution ──

/** Whether a resolved dependency's version satisfies the range abuddy.json declares. */
function inRange(artifacts: DepArtifacts, range: string): boolean {
  if (!range || range === '*') return true;
  const version = clean(artifacts.snapshot.manifest?.version ?? '');
  return version !== null && satisfies(version, range, { includePrerelease: true });
}

/** Built-in packs published by an installed AgentBuddy (any channel) into its data dir at boot. */
function resolveFromInstalledApp(depId: string, range: string): (DepArtifacts & { env: AppEnv }) | null {
  for (const env of ['production', 'beta', 'development', 'test'] as const) {
    const found = findDepArtifacts(path.join(resolveAppContext({ env }).hostPacksDir, depId));
    if (found && inRange(found, range)) return { ...found, env };
  }
  return null;
}

/** Built-in packs of the app configured for `abuddy test` (a checkout or a downloaded beta). */
async function resolveFromConfiguredApp(root: string, depId: string): Promise<(DepArtifacts & { label: string }) | null> {
  let hostVersion: string | undefined;
  try { hostVersion = readManifest(root).hostVersion; } catch {}
  const app = await configuredAppPackagesDir({ hostVersion });
  if (!app) return null;
  const found = findDepArtifacts(path.join(app.dir, depId));
  return found && { ...found, label: app.label };
}

// ── File path resolution ──

function resolveFromFile(root: string, filePath: string): DepArtifacts | null {
  return findDepArtifacts(path.resolve(root, filePath));
}

// ── GitHub release resolution ──

interface GitHubRelease {
  tag_name: string;
  assets: Array<{ name: string; url: string }>;
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

async function resolveFromGitHub(root: string, depId: string, repo: string, range: string): Promise<DepArtifacts | null> {
  const url = `https://api.github.com/repos/${repo}/releases?per_page=100`;

  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    if (res.status === 404) console.warn(`  GitHub repo not found: ${repo}`);
    else console.warn(`  GitHub API error (${res.status}) for ${repo}`);
    return null;
  }

  const releases = await res.json() as GitHubRelease[];

  const matching = releases
    .map(r => ({ release: r, version: tagToVersion(r.tag_name) }))
    .filter((r): r is { release: GitHubRelease; version: string } =>
      r.version !== null && satisfies(r.version, range))
    .sort((a, b) => rcompare(a.version, b.version));

  if (matching.length === 0) {
    console.warn(`  No release matching "${range}" in ${repo}`);
    return null;
  }

  const { release, version } = matching[0];

  const asset = release.assets.find(a => a.name.endsWith('.tgz'));
  if (!asset) {
    console.warn(`  Release ${release.tag_name} in ${repo} has no .tgz asset`);
    return null;
  }
  const checksumAsset = release.assets.find(a => a.name === `${asset.name}.sha256`);

  return downloadAndExtract(root, asset, checksumAsset, depId, version);
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
  checksumAsset: { name: string; url: string } | undefined,
  depId: string,
  version: string,
): Promise<DepArtifacts | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-fetch-'));
  try {
    const archive = path.join(tmpDir, asset.name);
    if (!await downloadAsset(asset.url, archive)) return null;

    let sha256: string | undefined;
    if (checksumAsset) {
      const checksumFile = path.join(tmpDir, checksumAsset.name);
      if (!await downloadAsset(checksumAsset.url, checksumFile)) return null;
      sha256 = fs.readFileSync(checksumFile, 'utf-8').trim().split(/\s+/)[0];
    }

    const extracted = await extractBundleArchive(archive, path.join(tmpDir, 'extracted'), sha256);
    const artifacts = findDepArtifacts(extracted);
    if (!artifacts) {
      console.warn(`  No snapshot found in ${asset.name} for ${depId}@${version}`);
      return null;
    }
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

function cacheDep(root: string, depId: string, artifacts: DepArtifacts): void {
  const depDir = depCacheDir(root, depId);
  const { snapshot, buildDir } = artifacts;
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
}

// ── Resolution chain ──

/**
 * Sources on this machine, in order: the workspace, the app configured for `abuddy test`
 * (ABUDDY_APP, ABUDDY_ROOT or the saved choice), then installed apps. Each must satisfy the
 * declared range. They're cheap, so they're re-read on every build instead of trusting the cache.
 */
async function resolveFromMachine(root: string, depId: string, range: string): Promise<(DepArtifacts & { source: string }) | null> {
  const workspace = resolveFromWorkspace(root, depId);
  if (workspace && inRange(workspace, range)) return { ...workspace, source: 'workspace' };

  const configured = await resolveFromConfiguredApp(root, depId);
  if (configured && inRange(configured, range)) {
    return { snapshot: configured.snapshot, buildDir: configured.buildDir, source: configured.label };
  }

  const installed = resolveFromInstalledApp(depId, range);
  if (installed) return { snapshot: installed.snapshot, buildDir: installed.buildDir, source: `installed app (${installed.env})` };
  return null;
}

async function resolveFromNetwork(root: string, depId: string, github: string | null, range: string): Promise<(DepArtifacts & { source: string }) | null> {
  if (github) {
    const found = await resolveFromGitHub(root, depId, github, range);
    return found && { ...found, source: `github:${github}@${found.snapshot.manifest.version}` };
  }
  const registrySource = await lookupRegistry(depId);
  if (registrySource) {
    const found = await resolveFromGitHub(root, depId, registrySource, range);
    if (found) return { ...found, source: `registry → github:${registrySource}@${found.snapshot.manifest.version}` };
  }
  return null;
}

async function resolveFromUpstream(root: string, depId: string, depValue: string): Promise<(DepArtifacts & { source: string }) | null> {
  const { github, filePath, range } = parseDepValue(depValue);

  if (filePath) {
    const found = resolveFromFile(root, filePath);
    if (found) return { ...found, source: `file:${path.resolve(root, filePath)}` };
    console.warn(`  Warning: no snapshot in ${path.resolve(root, filePath)} (build it first)`);
    return null;
  }

  return (await resolveFromMachine(root, depId, range)) ?? resolveFromNetwork(root, depId, github, range);
}

/**
 * Resolve a dependency's artifacts (snapshot + optional build code). Sources on this machine
 * win and refresh the .abuddy/deps cache; the cache only stands in for a network source, and
 * only while it satisfies the declared range.
 */
export async function resolveDepArtifacts(root: string, depId: string, depValue: string, skipCache = false): Promise<DepArtifacts | null> {
  const { github, filePath, range } = parseDepValue(depValue);
  if (filePath) {
    const found = await resolveFromUpstream(root, depId, depValue);
    return found && { snapshot: found.snapshot, buildDir: found.buildDir };
  }

  const local = await resolveFromMachine(root, depId, range);
  if (local) {
    cacheDep(root, depId, local);
    return resolveFromLocal(root, depId);
  }

  if (!skipCache) {
    const cached = resolveFromLocal(root, depId);
    if (cached && inRange(cached, range)) return cached;
  }

  const fetched = await resolveFromNetwork(root, depId, github, range);
  if (!fetched) return null;
  cacheDep(root, depId, fetched);
  return resolveFromLocal(root, depId);
}

export async function resolveDep(root: string, depId: string, depValue: string, skipCache = false): Promise<PackSnapshot | null> {
  return (await resolveDepArtifacts(root, depId, depValue, skipCache))?.snapshot ?? null;
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
    const result = await resolveFromUpstream(root, depId, depValue);
    if (result) {
      if (!depValue.startsWith('file:')) cacheDep(root, depId, result);
      const entityCount = Object.keys(result.snapshot.types.entities).length;
      const relCount = Object.keys(result.snapshot.types.relKinds).length;
      const defCount = Object.keys(result.snapshot.defs).length;
      console.log(`  ${depId}: ${entityCount} entities, ${relCount} relKinds, ${defCount} def(s) (${result.source})`);
      resolved++;
    } else {
      failed.push(depId);
    }
  }

  if (failed.length > 0) {
    console.warn(`\nFailed to resolve: ${failed.join(', ')}`);
    console.warn('Check the dependency value in abuddy.json (e.g. "github:owner/repo >=0.1.0").');
  }

  console.log(`\nResolved ${resolved}/${depIds.length} dependencies`);
}
