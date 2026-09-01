import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackTypeManifest, PackSnapshot } from '@abuddy/sdk/build';
import { findPackRoot, readManifest } from '../utils';

function wrapTypes(types: PackTypeManifest): PackSnapshot {
  return { types, defs: {}, manifest: { id: '', name: '', version: '' } };
}

function tryReadSnapshot(snapshotPath: string): PackSnapshot | null {
  if (fs.existsSync(snapshotPath)) {
    return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  }
  return null;
}

function tryReadTypes(typesPath: string): PackSnapshot | null {
  if (fs.existsSync(typesPath)) {
    return wrapTypes(JSON.parse(fs.readFileSync(typesPath, 'utf-8')));
  }
  return null;
}

function resolveFromDir(dir: string): PackSnapshot | null {
  return tryReadSnapshot(path.join(dir, 'snapshot.json'))
    ?? tryReadTypes(path.join(dir, 'types.json'));
}

async function resolveFromLocal(root: string, depId: string): Promise<PackSnapshot | null> {
  const depDir = path.join(root, '.abuddy', 'deps', depId);
  return tryReadSnapshot(path.join(depDir, 'snapshot.json'))
    ?? tryReadTypes(path.join(depDir, 'types.json'));
}

async function resolveFromNodeModules(root: string, depId: string): Promise<PackSnapshot | null> {
  const candidates = [
    path.join(root, 'node_modules', '@abuddy-pack', depId, 'dist'),
    path.join(root, 'node_modules', '@abuddy-pack', depId),
  ];

  if (depId === 'default-setup') {
    candidates.unshift(
      path.join(root, 'node_modules', '@app', 'default-setup', 'dist'),
    );
  }

  for (const dir of candidates) {
    const result = resolveFromDir(dir);
    if (result) return result;
  }
  return null;
}

async function resolveFromWorkspace(root: string, depId: string): Promise<PackSnapshot | null> {
  const candidates = [
    path.resolve(root, '..', depId, 'dist'),
    path.resolve(root, '..', '..', 'packages', depId, 'dist'),
    path.resolve(root, '..', '..', depId, 'dist'),
  ];

  for (const dir of candidates) {
    const result = resolveFromDir(dir);
    if (result) return result;
  }
  return null;
}

async function resolveFromRegistry(depId: string): Promise<PackSnapshot | null> {
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
    return extractSnapshotFromTarball(buffer);
  } catch {
    return null;
  }
}

function extractSnapshotFromTarball(buffer: Buffer): PackSnapshot | null {
  try {
    const { gunzipSync } = require('node:zlib') as typeof import('node:zlib');
    const decompressed = gunzipSync(buffer);

    let offset = 0;
    while (offset < decompressed.length - 512) {
      const header = decompressed.subarray(offset, offset + 512);
      const name = header.subarray(0, 100).toString('utf-8').replace(/\0/g, '');
      if (!name) break;

      const sizeOctal = header.subarray(124, 136).toString('utf-8').replace(/\0/g, '').trim();
      const size = parseInt(sizeOctal, 8) || 0;

      if (name.endsWith('dist/snapshot.json') || name.endsWith('/snapshot.json')) {
        const content = decompressed.subarray(offset + 512, offset + 512 + size).toString('utf-8');
        return JSON.parse(content);
      }

      if (name.endsWith('dist/types.json') || name.endsWith('/types.json')) {
        const content = decompressed.subarray(offset + 512, offset + 512 + size).toString('utf-8');
        return wrapTypes(JSON.parse(content));
      }

      offset += 512 + Math.ceil(size / 512) * 512;
    }
  } catch {}
  return null;
}

function cacheDep(root: string, depId: string, snapshot: PackSnapshot): void {
  const depDir = path.join(root, '.abuddy', 'deps', depId);
  fs.mkdirSync(depDir, { recursive: true });
  fs.writeFileSync(path.join(depDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
  fs.writeFileSync(path.join(depDir, 'types.json'), JSON.stringify(snapshot.types, null, 2));

  const defsDir = path.join(depDir, 'defs');
  if (Object.keys(snapshot.defs).length > 0) {
    fs.mkdirSync(defsDir, { recursive: true });
    for (const [key, content] of Object.entries(snapshot.defs)) {
      fs.writeFileSync(path.join(defsDir, `${key}.d.ts`), content);
    }
  }
}

export async function resolveDep(root: string, depId: string): Promise<PackSnapshot | null> {
  const cached = await resolveFromLocal(root, depId);
  if (cached) return cached;

  const fromNodeModules = await resolveFromNodeModules(root, depId);
  if (fromNodeModules) {
    cacheDep(root, depId, fromNodeModules);
    return fromNodeModules;
  }

  const fromWorkspace = await resolveFromWorkspace(root, depId);
  if (fromWorkspace) {
    cacheDep(root, depId, fromWorkspace);
    return fromWorkspace;
  }

  const fromRegistry = await resolveFromRegistry(depId);
  if (fromRegistry) {
    cacheDep(root, depId, fromRegistry);
    return fromRegistry;
  }

  return null;
}

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
    const result = await resolveDep(root, depId);
    if (result) {
      const entityCount = Object.keys(result.types.entities).length;
      const relCount = Object.keys(result.types.relKinds).length;
      const defCount = Object.keys(result.defs).length;
      console.log(`  ${depId}: ${entityCount} entities, ${relCount} relKinds, ${defCount} def(s)`);
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
