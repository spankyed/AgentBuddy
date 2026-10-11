import { packRecord } from '../installed.ts';
import type { PackRegistry } from '../registry.ts';

/**
 * Why a just-installed or updated pack isn't working, or undefined when it activated and
 * applied. A pack whose runtime fails to load registers nothing and never applies, so its
 * installed-packs entry has no lastError: the activation result, and the load problem the
 * registry recorded for it, have to be checked too.
 */
export function activationProblem(registry: Pick<PackRegistry, 'loadProblem'>, packId: string, activated: boolean): string | undefined {
  if (!activated) {
    const loadProblem = registry.loadProblem(packId);
    return loadProblem ? `failed to load: ${loadProblem}` : 'failed to load (see the app logs for the loader error)';
  }
  // An apply records failures (e.g. invalid flows) on the pack's record
  const applyError = packRecord(packId).lastError;
  return applyError ? `its content failed to apply:\n${applyError}` : undefined;
}
