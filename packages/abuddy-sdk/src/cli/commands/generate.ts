import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackSnapshot, PackTypeManifest } from '../../build';
import { emitDepTypes } from '../../build';
import { resolveDep } from './fetch-deps';
import { findPackRoot, readManifest } from '../utils';

async function loadDepSnapshots(root: string, deps: Record<string, string>): Promise<Map<string, PackSnapshot>> {
  const result = new Map<string, PackSnapshot>();
  for (const [depId, depValue] of Object.entries(deps)) {
    const resolved = await resolveDep(root, depId, depValue);
    if (!resolved) {
      console.warn(`  Warning: could not resolve dependency "${depId}" — try "abuddy fetch-deps"`);
      continue;
    }
    result.set(depId, resolved);
  }
  return result;
}

export interface ResolvedDeps {
  depTypes: Map<string, PackTypeManifest>;
  depSnapshots: Map<string, PackSnapshot>;
}

export async function resolveDeps(root: string, deps?: Record<string, string>): Promise<ResolvedDeps> {
  const depSnapshots = deps
    ? await loadDepSnapshots(root, deps)
    : new Map<string, PackSnapshot>();

  const depTypes = new Map<string, PackTypeManifest>();
  for (const [id, snap] of depSnapshots) depTypes.set(id, snap.types);

  return { depTypes, depSnapshots };
}

// ── Command ──

export async function generate(_args: string[], packRoot?: string, preResolvedDeps?: Map<string, PackSnapshot>) {
  const root = packRoot ?? findPackRoot(process.cwd());
  const manifest = readManifest(root);

  console.log(`Generating types for: ${manifest.name}`);

  const depSnapshots = preResolvedDeps ?? (manifest.dependencies
    ? await loadDepSnapshots(root, manifest.dependencies)
    : new Map<string, PackSnapshot>());

  const generatedDir = path.join(root, '.abuddy', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });

  const typesPath = path.join(generatedDir, 'types.ts');
  fs.writeFileSync(typesPath, emitDepTypes(depSnapshots));

  const depCount = depSnapshots.size;
  console.log(`  Types:     ${path.relative(process.cwd(), typesPath)}${depCount > 0 ? ` (from ${depCount} deps)` : ''}`);
}
