import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readDependencyBuild } from '@apackdev/host/packs';
import type { ResolvedDepFiles } from '../commands/fetch-deps.ts';

/** The captured declarations and complete verified build, independent of its delivery path. */
export function dependencyInputsHash(files: ReadonlyMap<string, ResolvedDepFiles>): string {
  const hash = createHash('sha256');
  for (const id of [...files.keys()].sort()) {
    const file = files.get(id)!;
    hash.update(JSON.stringify([id, file.kind, file.revision, file.snapshot]));
  }
  return hash.digest('hex');
}

/** Publication consumes the accepted frame, even if another resolution has since been selected. */
export function assertDependencyInputsCurrent(files: ReadonlyMap<string, ResolvedDepFiles>): void {
  for (const [id, expected] of files) {
    const current = readDependencyBuild(expected.directory);
    if (current.kind !== expected.kind || current.revision !== expected.revision
      || current.snapshot.manifest.id !== id || !isDeepStrictEqual(current.snapshot, expected.snapshot)) {
      throw new Error(`Dependency "${id}" changed during the build; retry before publishing`);
    }
  }
}
