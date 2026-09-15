import { repository } from './repository.ts';
import type { EARS } from '../types/entities.ts';
import type { PromptEntity } from '../types/sdk-entities.ts';
import type { CompiledRows } from '../build/compilers/flow-compiler.ts';

/**
 * The built-in repositories SDK code calls: services (CLI paths, runtime errors on
 * turn nodes) and the standard seeders and boot seed. default-setup registers them; only the members
 * the SDK uses are typed here, and default-setup's `builtin-repositories.spec.ts` checks its
 * repositories satisfy this contract.
 * @internal
 */
export interface BuiltinRepositories {
  settingsQueries: {
    /** The code plugin's settings hold the CLI path overrides */
    getPluginSettings(pluginId: string): { cliPaths?: Record<string, string | undefined> } | null | undefined;
    getInternalSettings(): {
      hasOnboarded: boolean;
      version: string;
      seedHash?: string | null;
      packSeedHashes?: Record<string, string>;
      packVersions?: Record<string, string>;
    };
  };
  settingsCommands: {
    updateSettings(type: string, label: string | null, path: string[], value: unknown): void;
    resetSettings(): void;
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
