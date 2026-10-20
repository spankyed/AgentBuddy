import { errorMessage } from '@apackdev/sdk/utils/pure';
import type { DependencyOrigin } from '@apackdev/host/packs';
import { resolveDepFiles, type ResolvedDepFiles } from '../commands/fetch-deps.ts';

export interface DependencyInspection {
  id: string;
  spec: string;
  status: 'resolved' | 'unavailable' | 'invalid';
  problem?: string;
  version?: string;
  origin?: DependencyOrigin;
  revision?: string;
  directory?: string;
  delivery?: 'cache' | 'source';
  kind?: ResolvedDepFiles['kind'];
  execution?: { buildCode: boolean; runtime: boolean; problem?: string };
}

/** One read-only resolution frame for both diagnostic presentation and codegen validation. */
export async function inspectDependencies(root: string, dependencies: Record<string, string> = {}): Promise<{
  entries: DependencyInspection[];
  files: Map<string, ResolvedDepFiles>;
}> {
  const entries: DependencyInspection[] = [];
  const files = new Map<string, ResolvedDepFiles>();
  for (const [id, spec] of Object.entries(dependencies)) {
    try {
      const resolved = await resolveDepFiles(root, id, spec, { readOnly: true });
      if (!resolved) {
        entries.push({ id, spec, status: 'unavailable', problem: 'No local dependency data; build linked dependencies or run "apack pack fetch-deps".' });
        continue;
      }
      files.set(id, resolved);
      entries.push({ id, spec, status: 'resolved', version: resolved.snapshot.manifest.version,
        origin: resolved.origin, revision: resolved.revision, directory: resolved.directory,
        delivery: resolved.resolution ? 'cache' : 'source', kind: resolved.kind,
        execution: { buildCode: Boolean(resolved.buildDir), runtime: Boolean(resolved.runtimeEntry),
          ...(resolved.executionProblem && { problem: resolved.executionProblem }) },
      });
    } catch (error) {
      entries.push({ id, spec, status: 'invalid', problem: errorMessage(error) });
    }
  }
  return { entries, files };
}

export function describeDependency(entry: DependencyInspection): string {
  if (entry.status !== 'resolved') return `${entry.id} (${entry.spec}): ${entry.status} — ${entry.problem}`;
  const origin = entry.origin;
  const where = !origin ? 'unknown origin' : origin.kind === 'github'
    ? `github:${origin.repository}@${origin.tag}` : `${origin.selection}: ${origin.directory}`;
  return `${entry.id} (${entry.spec}) → ${entry.version}; ${where}; ${entry.delivery} ${entry.directory}; revision ${entry.revision}`
    + (entry.execution?.problem ? `; execution unavailable: ${entry.execution.problem}` : '');
}
