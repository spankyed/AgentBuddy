import type { ApplicationHotkeys } from '@abuddy/sdk/types';
import type { HelpEntry } from '@abuddy/sdk/framework';
import type { ImportCounts } from '@abuddy/sdk/utils';
import type { PackSeedsPreview } from '@abuddy/sdk/seed';
import type { SecretInfo, SecretsStatus } from '@abuddy/sdk/services';
import type { SettingsDocument } from './store.ts';
// The settings feature's contract: what its system receives, what it sends its plugin, and its context.
// A leaf the system module doesn't import back, so codegen reads it without resolving the machine.

export type IncomingSettingsEvents =
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; entityType: 'section' | 'plugin'; label: string; path: string[]; value: any }
  | { type: 'RESET_SETTINGS' }
  | { type: 'PREVIEW_PACK_SEEDS'; directory: string }
  | { type: 'IMPORT_PACK_SEEDS'; directory: string; include?: Record<string, string[] | null>; mode?: 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace'; restartBrain?: boolean }
  | { type: 'REPLACE_SETTINGS'; data: unknown }
  | { type: 'RESET_APP' }

// The host's secrets store sends this over the bus (`secrets/index.ts`, `forwardSecretsChanges`), so it arrives
// from outside the feature like any other incoming event, not from a child of this system
export type IncomingSecretsEvents =
  | { type: 'SECRETS_CHANGED' } // The host's stored keys or their protection changed (no values)

// What this system's own `fromCallback` children send it. Nothing else sends these.
export type SettingsInternalEvents =
  | { type: 'PACK_SETTINGS_CHANGED' } // A pack's feature settings (defaults) registered or unregistered
  | { type: 'SETTINGS_WRITTEN' } // Something wrote the stored settings: this system, a feature's system, an action or a seed
  // The stored data is being replaced wholesale (a backup import), and has been: what each feature was told is then
  // stale either way, since a failed import may have migrated some of the data already
  | { type: 'DATA_REPLACING' }
  | { type: 'DATA_REPLACED' }

export type OutgoingSettingsEvents =
  | { type: 'SETTINGS_LOADED'; data: SettingsDocument; help: HelpEntry[] }
  /** The installed packs changed, so what they answer with in Help has too */
  | { type: 'HELP_UPDATED'; help: HelpEntry[] }
  | { type: 'SETTINGS_UPDATED'; data: SettingsDocument }
  /** A change (`UPDATE_SETTINGS`, `REPLACE_SETTINGS`) was stored */
  | { type: 'SETTINGS_SAVED' }
  /** A change was refused, and stored nothing */
  | { type: 'SETTINGS_REFUSED'; problems: string[] }
  | { type: 'SETTINGS_RESET'; data: SettingsDocument }
  | { type: 'APPLICATION_HOTKEYS'; hotkeys: ApplicationHotkeys }
  /** `errors` lists the records that couldn't be seeded (`<key>: <error>`); the rest were imported */
  | { type: 'PACK_SEEDS_IMPORTED'; result: Record<string, ImportCounts>; errors: string[] }
  | { type: 'PACK_SEEDS_IMPORT_FAILED'; error: string }
  | { type: 'PACK_SEEDS_PREVIEW'; preview: PackSeedsPreview }
  | { type: 'PACK_SEEDS_PREVIEW_FAILED'; error: string }
  | { type: 'APP_RESET_COMPLETE' }
  | { type: 'APP_RESET_FAILED'; error: string }
  /** The stored API keys, without values, and how they're protected */
  | { type: 'SECRETS_UPDATED'; secrets: SecretInfo[]; status: SecretsStatus }

export type SettingsContext = { applied: Record<string, unknown> };
