import * as path from 'node:path';
import type { PackSnapshot, PackTypeManifest } from '@abuddy/sdk/build';
import { resolveDepFiles } from './fetch-deps';

async function loadDepSnapshots(root: string, deps: Record<string, string>): Promise<Map<string, PackSnapshot>> {
  const result = new Map<string, PackSnapshot>();
  const unresolved: string[] = [];
  for (const [depId, depValue] of Object.entries(deps)) {
    const artifacts = await resolveDepFiles(root, depId, depValue);
    const resolved = artifacts?.snapshot;
    if (!resolved) {
      unresolved.push(depValue.startsWith('file:')
        ? `${depId}: no build output at ${path.resolve(root, depValue.slice('file:'.length).trim())} (run "abuddy build" there first)`
        : `${depId} ("${depValue}"): not found in the installed app, a workspace, a GitHub release or the local cache`);
      continue;
    }
    result.set(depId, resolved);
  }
  // Generated types and flow helpers depend on every dependency; continuing would fail
  // later with misleading errors (e.g. missing flow helper exports)
  if (unresolved.length > 0) {
    throw new Error(`Unresolved pack dependencies:\n${unresolved.map(u => `  - ${u}`).join('\n')}\nUse "file:<path>" or "github:<owner>/<repo> <range>" in abuddy.json dependencies.`);
  }
  return result;
}

export interface ResolvedDeps {
  depTypes: Map<string, PackTypeManifest>;
  depSnapshots: Map<string, PackSnapshot>;
}

export async function resolveDeps(root: string, deps?: Record<string, string>): Promise<ResolvedDeps> {
  const depSnapshots = deps ? await loadDepSnapshots(root, deps) : new Map<string, PackSnapshot>();

  const depTypes = new Map<string, PackTypeManifest>();
  for (const [id, snap] of depSnapshots) depTypes.set(id, snap.types);

  return { depTypes, depSnapshots };
}
