// Resetting settings resets the user's settings, not the app's own state (onboarding, pack versions, seed hashes).
// That state used to live in the Settings row's `internal` section, which resetSettings() erased; it's the host's
// AppState row now, which this pack never reads but the test does, as the host stores it.
import { describe, expect, it } from 'vitest';
import { tx, untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import { repository } from '@/__generated__/repository';
import { services } from '@/__generated__/services';
import { ref } from '@/__generated__/ref';

const APP_STATE_ID = 'AppState-app' as EARS.EntityId;
const appState = () => untypedQx(APP_STATE_ID).pickOne(['hasOnboarded', 'packVersions', 'packSeedHashes']);

describe('resetting settings', () => {
  it("keeps the app's own state", () => {
    services.appData.completeOnboarding();
    tx(APP_STATE_ID).update('packVersions', { 'memo-pack': '1.2.0' }).update('packSeedHashes', { 'memo-pack': 'hash-1' });
    repository.settingsCommands.updatePluginSetting(ref('threads'), ['sort'], 'oldest');

    repository.settingsCommands.resetSettings();

    expect(repository.settingsQueries.getPluginSettings(ref('threads'))).not.toMatchObject({ sort: 'oldest' });
    expect(appState()).toMatchObject({
      hasOnboarded: true,
      packVersions: { 'memo-pack': '1.2.0' },
      packSeedHashes: { 'memo-pack': 'hash-1' },
    });
    expect(services.appData.hasOnboarded()).toBe(true);
  });
});
