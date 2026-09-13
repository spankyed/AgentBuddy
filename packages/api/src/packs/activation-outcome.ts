import { readPackRegistry } from '@abuddy/sdk/packs';

/**
 * Why a just-installed or updated pack isn't working, or undefined when it activated and
 * seeded. A pack whose runtime fails to load registers nothing and never seeds, so its
 * registry entry has no lastError: the activation result has to be checked too.
 */
export function activationProblem(packId: string, activated: boolean): string | undefined {
  if (!activated) return 'failed to load (see the app logs for the loader error)';
  // Seeding records failures (e.g. invalid flows) on the registry entry
  const seedError = readPackRegistry().find(e => e.id === packId)?.lastError;
  return seedError ? `its data failed to seed:\n${seedError}` : undefined;
}
