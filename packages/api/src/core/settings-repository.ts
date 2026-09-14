import { repository } from '@abuddy/sdk/ears';

/** The internal settings the host reads and writes (owned by the built-in default-setup pack). */
export interface HostInternalSettings {
  hasOnboarded: boolean;
  version: string;
  packSeedHashes?: Record<string, string>;
  packVersions?: Record<string, string>;
}

/**
 * The settings repositories default-setup registers, as far as the host uses them. The host is
 * typed against this view instead of the pack's generated repository types.
 */
export interface HostSettingsRepositories {
  settingsQueries: {
    getInternalSettings(): HostInternalSettings;
    /** The model provider reads API key secret ids from `secrets` */
    getGeneralSettings(): { secrets?: Record<string, string | undefined> };
  };
  secretsQueries: { getSecret(id: string): { encryptedValue?: string } | undefined };
  settingsCommands: { updateSettings(type: 'internal', label: null, path: string[], value: unknown): void };
}

export const settingsRepository = repository as unknown as HostSettingsRepositories;
