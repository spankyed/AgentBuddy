import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackSnapshot } from '@abuddy/sdk/build';
import { findPackRoot, readManifest } from '../utils';

function tryReadSnapshot(filePath: string): PackSnapshot | null {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return null;
}

function resolveFromLocal(root: string, depId: string): PackSnapshot | null {
  return tryReadSnapshot(path.join(root, '.abuddy', 'deps', depId, 'snapshot.json'));
}

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

function resolveFromUpstream(root: string, depId: string): PackSnapshot | null {
  // TODO: add GitHub release resolver (fetch .tgz from tagged releases)
  return resolveFromWorkspace(root, depId);
}

// skipCache: true = always re-resolve from upstream (used by `fetch-deps` to refresh)
// skipCache: false = use local cache if available (used by `generate` for fast resolution)
export function resolveDep(root: string, depId: string, skipCache = false): PackSnapshot | null {
  if (!skipCache) {
    const cached = resolveFromLocal(root, depId);
    if (cached) return cached;
  }

  const resolved = resolveFromUpstream(root, depId);
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
    const result = resolveDep(root, depId, true);
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
