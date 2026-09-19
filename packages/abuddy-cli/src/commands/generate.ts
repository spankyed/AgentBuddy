import * as path from 'node:path';
import type { PackSnapshot, PackTypeManifest } from '@abuddy/sdk/build';
import { resolveDepFiles } from './fetch-deps';

async function loadDepSnapshots(root: string, deps: Record<string, string>): Promise<{ snapshots: Map<string, PackSnapshot>; sources: Map<string, string> }> {
  const result = new Map<string, PackSnapshot>();
  const sources = new Map<string, string>();
  const unresolved: string[] = [];
  for (const [depId, depValue] of Object.entries(deps)) {
    const artifacts = await resolveDepFiles(root, depId, depValue);
    const resolved = artifacts?.snapshot;
    if (artifacts?.resolvedFrom) sources.set(depId, artifacts.resolvedFrom);
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
  return { snapshots: result, sources };
}

export interface ResolvedDeps {
  depTypes: Map<string, PackTypeManifest>;
  depSnapshots: Map<string, PackSnapshot>;
  /**
   * Dependency id → where it resolved from, for the dependencies that reported one. It reaches
   * `generatePackFiles`, which uses it to tell a facade failure's reader what they can actually do:
   * `abuddy build` in a workspace sibling is right, and useless for a downloaded release.
   */
  depSources: Map<string, string>;
}

export async function resolveDeps(root: string, deps?: Record<string, string>): Promise<ResolvedDeps> {
  const { snapshots: depSnapshots, sources: depSources } = deps
    ? await loadDepSnapshots(root, deps)
    : { snapshots: new Map<string, PackSnapshot>(), sources: new Map<string, string>() };

  const depTypes = new Map<string, PackTypeManifest>();
  for (const [id, snap] of depSnapshots) depTypes.set(id, snap.types);

  return { depTypes, depSnapshots, depSources };
}
