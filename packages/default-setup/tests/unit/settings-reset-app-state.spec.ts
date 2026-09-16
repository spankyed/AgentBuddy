// Resetting settings resets the user's settings, not the app's own state (onboarding, pack versions,
// seed hashes). Today that state is stored inside the Settings row and resetSettings() erases it.
// Skipped until docs/goals/goal-package-boundaries.md Phase 5 moves it to the AppState entity; that
// phase unskips this test and rewrites its reads and writes against AppState.
import { describe, expect, it } from 'vitest';
import { repository } from '@/__generated__/repository';

describe('resetting settings', () => {
  it.skip("keeps the app's own state", () => {
    repository.settingsCommands.updateSettings('internal', null, ['hasOnboarded'], true);
    repository.settingsCommands.updateSettings('internal', null, ['packVersions'], { 'memo-pack': '1.2.0' });
    repository.settingsCommands.updateSettings('internal', null, ['packSeedHashes'], { 'memo-pack': 'hash-1' });
    repository.settingsCommands.updateSettings('plugin', 'threads', ['sort'], 'oldest');

    repository.settingsCommands.resetSettings();

    expect(repository.settingsQueries.getPluginSettings('threads')).not.toMatchObject({ sort: 'oldest' });
    expect(repository.settingsQueries.getInternalSettings()).toMatchObject({
      hasOnboarded: true,
      packVersions: { 'memo-pack': '1.2.0' },
      packSeedHashes: { 'memo-pack': 'hash-1' },
    });
  });
});
