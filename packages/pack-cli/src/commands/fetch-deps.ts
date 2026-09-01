import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import tar from 'tar';
import { satisfies, rcompare, clean } from 'semver';
import type { PackSnapshot } from '@abuddy/sdk/build';
import { findPackRoot, readManifest } from '../utils';

// ── Dependency value parsing ──

interface DepSource {
  github: string | null;  // "owner/repo" or null
  range: string;          // semver range, e.g. ">=0.1.0"
}

function parseDepValue(value: string): DepSource {
  if (value.startsWith('github:')) {
    const rest = value.slice('github:'.length).trim();
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) {
      return { github: rest, range: '*' };
    }
    return { github: rest.slice(0, spaceIdx), range: rest.slice(spaceIdx + 1).trim() };
  }
  return { github: null, range: value };
}

// ── Local cache ──

function tryReadSnapshot(filePath: string): PackSnapshot | null {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return null;
}

function resolveFromLocal(root: string, depId: string): PackSnapshot | null {
  return tryReadSnapshot(path.join(root, '.abuddy', 'deps', depId, 'snapshot.json'));
}

// ── Workspace resolution ──

function resolveFromWorkspace(root: string, depId: string): PackSnapshot | null {
  const candidates = [
    path.resolve(root, '..', depId, 'dist', 'snapshot.json'),
    path.resolve(root, '..', '..', 'packages', depId, 'dist', 'snapshot.json'),
    path.resolve(root, '..', '..', depId, 'dist', 'snapshot.json'),
  ];

  for (const candidate of candidates) {
    const result = tryReadSnapshot(candidate);
    if (result) return result;
  }
  return null;
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

async function resolveFromGitHub(depId: string, repo: string, range: string): Promise<PackSnapshot | null> {
  const url = `https://api.github.com/repos/${repo}/releases`;

  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    if (res.status === 404) console.warn(`  GitHub repo not found: ${repo}`);
    else console.warn(`  GitHub API error (${res.status}) for ${repo}`);
    return null;
  }

  const releases = await res.json() as GitHubRelease[];

  // Find releases with valid semver tags that satisfy the range, sorted newest first
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

  // Find the .tgz asset
  const asset = release.assets.find(a => a.name.endsWith('.tgz'));
  if (!asset) {
    console.warn(`  Release ${release.tag_name} in ${repo} has no .tgz asset`);
    return null;
  }

  return downloadAndExtract(asset.url, depId, version);
}

async function downloadAndExtract(assetUrl: string, depId: string, version: string): Promise<PackSnapshot | null> {
  const headers = { ...githubHeaders(), 'Accept': 'application/octet-stream' };
  const res = await fetch(assetUrl, { headers });
  if (!res.ok || !res.body) {
    console.warn(`  Failed to download asset (${res.status})`);
    return null;
  }

  // Extract snapshot.json from the tarball into a temp dir
  const tmpDir = fs.mkdtempSync(path.join(import.meta.dirname, '.fetch-'));
  try {
    const nodeStream = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
    await pipeline(
      nodeStream,
      tar.extract({ cwd: tmpDir, strip: 1, filter: (p: string) => p.endsWith('snapshot.json') }),
    );

    const snapshotPath = path.join(tmpDir, 'dist', 'snapshot.json');
    if (!fs.existsSync(snapshotPath)) {
      // Try without dist/ prefix (tarball structure may vary)
      const altPath = path.join(tmpDir, 'snapshot.json');
      if (!fs.existsSync(altPath)) {
        console.warn(`  No snapshot.json found in .tgz for ${depId}@${version}`);
        return null;
      }
      return JSON.parse(fs.readFileSync(altPath, 'utf-8'));
    }

    return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── abuddy.com registry (stub) ──

// Looks up a pack id in the abuddy.com registry to find its GitHub source.
// Returns "owner/repo" or null.
async function lookupRegistry(_depId: string): Promise<string | null> {
  // TODO: implement when api.abuddy.com is live
  // const res = await fetch(`https://api.abuddy.com/packs/${depId}`);
  // if (!res.ok) return null;
  // const data = await res.json() as { github?: string };
  // return data.github ?? null;
  return null;
}

// ── Cache ──

function cacheDep(root: string, depId: string, snapshot: PackSnapshot): void {
  const depDir = path.join(root, '.abuddy', 'deps', depId);
  fs.mkdirSync(depDir, { recursive: true });
  fs.writeFileSync(path.join(depDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2));

  const defsDir = path.join(depDir, 'defs');
  if (Object.keys(snapshot.defs).length > 0) {
    fs.mkdirSync(defsDir, { recursive: true });
    for (const [key, content] of Object.entries(snapshot.defs)) {
      fs.writeFileSync(path.join(defsDir, `${key}.d.ts`), content);
    }
  }
}

// ── Resolution chain ──

async function resolveFromUpstream(root: string, depId: string, depValue: string): Promise<{ snapshot: PackSnapshot; source: string } | null> {
  const { github, range } = parseDepValue(depValue);

  // Explicit github: prefix — go directly to GitHub
  if (github) {
    const snapshot = await resolveFromGitHub(depId, github, range);
    if (snapshot) return { snapshot, source: `github:${github}@${snapshot.manifest.version}` };
    return null;
  }

  // Workspace resolution
  const workspace = resolveFromWorkspace(root, depId);
  if (workspace) return { snapshot: workspace, source: 'workspace' };

  // Registry lookup → GitHub
  const registrySource = await lookupRegistry(depId);
  if (registrySource) {
    const snapshot = await resolveFromGitHub(depId, registrySource, range);
    if (snapshot) return { snapshot, source: `registry → github:${registrySource}@${snapshot.manifest.version}` };
  }

  return null;
}

export async function resolveDep(root: string, depId: string, depValue: string, skipCache = false): Promise<PackSnapshot | null> {
  if (!skipCache) {
    const cached = resolveFromLocal(root, depId);
    if (cached) return cached;
  }

  const result = await resolveFromUpstream(root, depId, depValue);
  if (result) {
    cacheDep(root, depId, result.snapshot);
    return result.snapshot;
  }

  return null;
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
    const result = await resolveFromUpstream(root, depId, deps[depId]);
    if (result) {
      cacheDep(root, depId, result.snapshot);
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
