import { repository } from './repository.ts';
import type { EARS } from '../types/entities.ts';

/**
 * The built-in default-setup repositories SDK services read (provider API keys, CLI paths,
 * runtime errors on turn nodes). Only these members are typed; the registrations and their full
 * types live in default-setup. Not exported from the package.
 */
export interface BuiltinRepositories {
  settingsQueries: {
    getGeneralSettings(): { secrets?: Record<string, unknown> };
    getSettings(): { general: { secrets: { cliPaths?: Record<string, string | undefined> } } };
  };
  secretsQueries: {
    getSecret(id: EARS.EntityId): { encryptedValue?: string } | undefined;
  };
  brainCommands: {
    updateTNodeResult(id: EARS.EntityId, result: { error: Record<string, unknown> }): void;
  };
}

export const builtinRepository = repository as unknown as BuiltinRepositories;
