import { repository } from './repository.ts';
import type { EARS } from '../types/entities.ts';
import type { PromptEntity, SecretEntity } from '../types/sdk-entities.ts';
import type { CompiledRows } from '../build/compilers/flow-compiler.ts';

/**
 * The built-in repositories SDK code calls: services (provider API keys, CLI paths, runtime errors on
 * turn nodes) and the standard seeders and boot seed. default-setup registers them; only the members
 * the SDK uses are typed here, and default-setup's `builtin-repositories.spec.ts` checks its
 * repositories satisfy this contract.
 * @internal
 */
export interface BuiltinRepositories {
  settingsQueries: {
    getGeneralSettings(): { secrets?: Record<string, unknown> };
    getSettings(): { general: { secrets: { cliPaths?: Record<string, string | undefined> } } };
    getInternalSettings(): { seedHash?: string | null };
  };
  settingsCommands: {
    updateSettings(type: string, label: string | null, path: string[], value: unknown): void;
    resetSettings(): void;
  };
  secretsQueries: {
    getSecret(id: EARS.EntityId): SecretEntity | null;
  };
  brainCommands: {
    updateTNodeResult(id: EARS.EntityId, result: { error: Record<string, unknown> }): void;
  };
  flowsCommands: {
    importFromDSL(compiled: CompiledRows): { flowIds: EARS.EntityId[] };
    deleteFlow(flowId: EARS.EntityId, options?: { allowRoot?: boolean }): void;
  };
  promptQueries: {
    all(): PromptEntity[];
  };
}

export const builtinRepository = repository as unknown as BuiltinRepositories;
