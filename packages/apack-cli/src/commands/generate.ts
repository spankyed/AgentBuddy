import * as path from 'node:path';
import type { PackDependencySnapshot, PackTypeManifest } from '@apackdev/sdk/build';
import { resolveDepFiles, type DependencyResolutionOptions } from './fetch-deps';

async function loadDepSnapshots(root: string, deps: Record<string, string>, options: DependencyResolutionOptions): Promise<Map<string, PackDependencySnapshot>> {
  const result = new Map<string, PackDependencySnapshot>();
  const unresolved: string[] = [];
  for (const [depId, depValue] of Object.entries(deps)) {
    const artifacts = await resolveDepFiles(root, depId, depValue, options);
    const resolved = artifacts?.snapshot;
    if (!resolved) {
      unresolved.push(depValue.startsWith('file:')
        ? `${depId}: no build output at ${path.resolve(root, depValue.slice('file:'.length).trim())} (run "apack pack build" there first)`
        : `${depId} ("${depValue}"): not found in the installed app, a workspace, a GitHub release or the local cache`);
      continue;
    }
    result.set(depId, resolved);
  }
  // Generated types and flow helpers depend on every dependency; continuing would fail
  // later with misleading errors (e.g. missing flow helper exports)
  if (unresolved.length > 0) {
    throw new Error(`Unresolved pack dependencies:\n${unresolved.map(u => `  - ${u}`).join('\n')}\nUse "file:<path>" or "github:<owner>/<repo> <range>" in apack.json dependencies.`);
  }
  return result;
}

export interface ResolvedDeps {
  depTypes: Map<string, PackTypeManifest>;
  depSnapshots: Map<string, PackDependencySnapshot>;
}

export async function resolveDeps(root: string, deps?: Record<string, string>, options: DependencyResolutionOptions = {}): Promise<ResolvedDeps> {
  const depSnapshots = deps ? await loadDepSnapshots(root, deps, options) : new Map<string, PackDependencySnapshot>();

  const depTypes = new Map<string, PackTypeManifest>();
  for (const [id, snap] of depSnapshots) depTypes.set(id, snap.types);

  return { depTypes, depSnapshots };
}
