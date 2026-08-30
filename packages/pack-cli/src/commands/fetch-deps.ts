import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackManifest, PackTypeManifest } from '@abuddy/sdk/build';

function findPackRoot(from: string): string {
  let dir = from;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'abuddy.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('No abuddy.json found. Run this command from inside a pack directory.');
}

async function resolveFromLocal(root: string, depId: string): Promise<PackTypeManifest | null> {
  const cached = path.join(root, '.abuddy', 'deps', depId, 'types.json');
  if (fs.existsSync(cached)) {
    return JSON.parse(fs.readFileSync(cached, 'utf-8'));
  }
  return null;
}

async function resolveFromNodeModules(root: string, depId: string): Promise<PackTypeManifest | null> {
  const candidates = [
    path.join(root, 'node_modules', `@abuddy-pack`, depId, 'dist', 'types.json'),
    path.join(root, 'node_modules', `@abuddy-pack`, depId, 'types.json'),
  ];

  if (depId === 'default-setup') {
    candidates.unshift(
      path.join(root, 'node_modules', '@abuddy', 'sdk', 'default-setup-types.json'),
      path.join(root, 'node_modules', '@app', 'default-setup', 'dist', 'types.json'),
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf-8'));
    }
  }
  return null;
}

async function resolveFromWorkspace(root: string, depId: string): Promise<PackTypeManifest | null> {
  const candidates = [
    path.resolve(root, '..', depId, 'dist', 'types.json'),
    path.resolve(root, '..', '..', 'packages', depId, 'dist', 'types.json'),
    path.resolve(root, '..', '..', depId, 'dist', 'types.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf-8'));
    }
  }
  return null;
}

async function resolveFromRegistry(depId: string): Promise<PackTypeManifest | null> {
  const packageName = `@abuddy-pack/${depId}`;
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;

  try {
    const metaRes = await fetch(registryUrl, {
      headers: { 'Accept': 'application/json' },
    });
    if (!metaRes.ok) return null;

    const meta = await metaRes.json() as {
      'dist-tags'?: { latest?: string };
      versions?: Record<string, { dist?: { tarball?: string } }>;
    };

    const latest = meta['dist-tags']?.latest;
    if (!latest) return null;

    const tarballUrl = meta.versions?.[latest]?.dist?.tarball;
    if (!tarballUrl) return null;

    const tarballRes = await fetch(tarballUrl);
    if (!tarballRes.ok) return null;

    const buffer = Buffer.from(await tarballRes.arrayBuffer());
    const types = extractTypesFromTarball(buffer);
    return types;
  } catch {
    return null;
  }
}

function extractTypesFromTarball(buffer: Buffer): PackTypeManifest | null {
  // npm tarballs are gzipped tar archives
  // The types.json is at package/dist/types.json
  // Using a minimal tar parser for this specific case
  try {
    const { gunzipSync } = require('node:zlib') as typeof import('node:zlib');
    const decompressed = gunzipSync(buffer);

    // Scan tar entries for dist/types.json or types.json
    let offset = 0;
    while (offset < decompressed.length - 512) {
      const header = decompressed.subarray(offset, offset + 512);
      const name = header.subarray(0, 100).toString('utf-8').replace(/\0/g, '');
      if (!name) break;

      const sizeOctal = header.subarray(124, 136).toString('utf-8').replace(/\0/g, '').trim();
      const size = parseInt(sizeOctal, 8) || 0;

      if (name.endsWith('dist/types.json') || name.endsWith('/types.json')) {
        const content = decompressed.subarray(offset + 512, offset + 512 + size).toString('utf-8');
        return JSON.parse(content);
      }

      offset += 512 + Math.ceil(size / 512) * 512;
    }
  } catch {}
  return null;
}

function cacheDep(root: string, depId: string, manifest: PackTypeManifest): void {
  const depDir = path.join(root, '.abuddy', 'deps', depId);
  fs.mkdirSync(depDir, { recursive: true });
  fs.writeFileSync(path.join(depDir, 'types.json'), JSON.stringify(manifest, null, 2));
}

export async function resolveDep(root: string, depId: string): Promise<PackTypeManifest | null> {
  // 1. Local cache
  const cached = await resolveFromLocal(root, depId);
  if (cached) return cached;

  // 2. Installed node_modules
  const fromNodeModules = await resolveFromNodeModules(root, depId);
  if (fromNodeModules) {
    cacheDep(root, depId, fromNodeModules);
    return fromNodeModules;
  }

  // 3. Monorepo workspace sibling
  const fromWorkspace = await resolveFromWorkspace(root, depId);
  if (fromWorkspace) {
    cacheDep(root, depId, fromWorkspace);
    return fromWorkspace;
  }

  // 4. npm registry
  const fromRegistry = await resolveFromRegistry(depId);
  if (fromRegistry) {
    cacheDep(root, depId, fromRegistry);
    return fromRegistry;
  }

  return null;
}

export async function fetchDeps(_args: string[]) {
  const root = findPackRoot(process.cwd());
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'abuddy.json'), 'utf-8')) as PackManifest;

  const deps = manifest.dependencies ?? {};
  const depIds = Object.keys(deps);

  if (depIds.length === 0) {
    console.log('No dependencies declared.');
    return;
  }

  console.log(`Fetching ${depIds.length} dependency type(s)...`);

  let resolved = 0;
  const failed: string[] = [];

  for (const depId of depIds) {
    const result = await resolveDep(root, depId);
    if (result) {
      const entityCount = Object.keys(result.entities).length;
      const relCount = Object.keys(result.relKinds).length;
      console.log(`  ${depId}: ${entityCount} entities, ${relCount} relKinds`);
      resolved++;
    } else {
      failed.push(depId);
    }
  }

  if (failed.length > 0) {
    console.warn(`\nFailed to resolve: ${failed.join(', ')}`);
    console.warn('Try installing the package first: npm install @abuddy-pack/<name>');
  }

  console.log(`\nResolved ${resolved}/${depIds.length} dependencies`);
}
