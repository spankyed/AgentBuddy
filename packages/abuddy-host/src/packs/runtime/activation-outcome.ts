import { packRecord } from '../installed.ts';
import type { PackRegistry } from '../registry.ts';

/**
 * Why a just-installed or updated pack isn't working, or undefined when it activated and
 * seeded. A pack whose runtime fails to load registers nothing and never seeds, so its
 * installed-packs entry has no lastError: the activation result, and the load problem the
 * registry recorded for it, have to be checked too.
 */
export function activationProblem(registry: Pick<PackRegistry, 'loadProblem'>, packId: string, activated: boolean): string | undefined {
  if (!activated) {
    const loadProblem = registry.loadProblem(packId);
    return loadProblem ? `failed to load: ${loadProblem}` : 'failed to load (see the app logs for the loader error)';
  }
  // Seeding records failures (e.g. invalid flows) on the pack's record
  const seedError = packRecord(packId).lastError;
  return seedError ? `its data failed to seed:\n${seedError}` : undefined;
}
