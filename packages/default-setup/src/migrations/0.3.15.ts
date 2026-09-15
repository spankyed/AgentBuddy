import { repository } from '@/__generated__/repository';
import type { PackMigration } from '@abuddy/sdk/framework';

/** What general.secrets held before API keys moved to the host's store and CLI paths to the code plugin */
type LegacySecretsSettings = { cliPaths?: Record<string, string | undefined> } & Record<string, unknown>;

export const migration: PackMigration = {
  target: '0.3.15',
  description: 'Move CLI path overrides from general.secrets to the code plugin; drop the general.secrets key map (keys live in the host store)',
  up: () => {
    const legacy = (repository.settingsQueries.getSettings().general as { secrets?: LegacySecretsSettings }).secrets;
    if (!legacy) return;

    const cliPaths = Object.fromEntries(Object.entries(legacy.cliPaths ?? {}).filter(([, path]) => typeof path === 'string' && path.trim() !== ''));
    const current = (repository.settingsQueries.getPluginSettings('code') as { cliPaths?: Record<string, string> }).cliPaths ?? {};
    if (Object.keys(cliPaths).length > 0 && Object.keys(current).length === 0) {
      repository.settingsCommands.updateSettings('plugin', 'code', ['cliPaths'], cliPaths);
    }

    repository.settingsCommands.updateSettings('general', 'secrets', [], undefined);
  },
};
