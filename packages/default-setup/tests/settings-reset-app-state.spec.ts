// Preferences reset independently of onboarding and pack lifecycle state.
import { describe, expect, it } from 'vitest';
import { untypedTx, untypedQx } from '@apackdev/ears';
import { getTestSettings, startApp } from '@apackdev/testing/harness';
import { featureSettings } from '#generated/settings.ts';
import { services } from '#generated/services.ts';

const APP_STATE_ID = 'AppState-app';

describe('resetting settings', () => {
  it("keeps the app's own state", async () => {
    const app = await startApp({ systems: ['host/settings'] });
    await app.connect();
    services.onboarding.complete();
    untypedTx(APP_STATE_ID).update('packVersions', { 'memo-pack': '1.2.0' }).update('failedAgainst', { 'memo-pack': 'provider:' });
    featureSettings.forFeature('threads').set({ path: ['recentThreadsSortOrder'], value: 'created' });

    const call = await app.send('host/settings', { type: 'RESET_ALL_SETTINGS' }, { settingsAccess: { kind: 'host', service: getTestSettings() }, sender: 'host/settings', client: 'c-window' });
    await app.nextEmit('host/settings', 'SETTINGS_SAVED', { answering: call });

    expect(featureSettings.forFeature('threads').get()).not.toMatchObject({ recentThreadsSortOrder: 'created' });
    expect(untypedQx(APP_STATE_ID).pickOne(['hasOnboarded', 'packVersions', 'failedAgainst'])).toMatchObject({
      hasOnboarded: true,
      packVersions: { 'memo-pack': '1.2.0' },
      failedAgainst: { 'memo-pack': 'provider:' },
    });
    expect(services.onboarding.isComplete()).toBe(true);
  });
});
