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

function resolveFromUpstream(root: string, depId: string): Promise<PackSnapshot | null> {
  // TODO: add GitHub release resolver (fetch .tgz from tagged releases)
  return resolveFromWorkspace(root, depId);
}

// skipCache: true = always re-resolve from upstream (used by `fetch-deps` to refresh)
// skipCache: false = use local cache if available (used by `generate` for fast resolution)
export async function resolveDep(root: string, depId: string, skipCache = false): Promise<PackSnapshot | null> {
  if (!skipCache) {
    const cached = await resolveFromLocal(root, depId);
    if (cached) return cached;
  }

  const resolved = await resolveFromUpstream(root, depId);
  if (resolved) {
    cacheDep(root, depId, resolved);
    return resolved;
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
    const result = await resolveDep(root, depId, true);
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
    console.warn('Ensure the dependency is available as a workspace sibling.');
  }

  console.log(`\nResolved ${resolved}/${depIds.length} dependencies`);
}
