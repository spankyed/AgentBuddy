// The pack's boot.onInit and boot.onShutdown run around a test's apps as around the app's run: onInit when the first
// app starts, onShutdown when the last one stops
import { describe, expect, it } from 'vitest';
import { startApp } from '@abuddy/testing/harness';
import { journal } from '../../src/features/memos/be/journal';

describe("the pack's boot hooks", () => {
  it('open the journal while an app runs, and close it when the app stops', async () => {
    expect(journal.isOpen).toBe(false);

    const app = await startApp({ systems: ['memos'] });
    expect(journal.isOpen).toBe(true);

    app.stop();
    expect(journal.isOpen).toBe(false);
  });

  it('run once for the apps a test runs together', async () => {
    const before = journal.timesOpened;
    const memosApp = await startApp({ systems: ['memos'] });
    const settingsApp = await startApp({ systems: ['default-setup/settings'] });
    expect(journal.timesOpened).toBe(before + 1);

    memosApp.stop();
    expect(journal.isOpen).toBe(true);
    settingsApp.stop();
    expect(journal.isOpen).toBe(false);
  });

});
