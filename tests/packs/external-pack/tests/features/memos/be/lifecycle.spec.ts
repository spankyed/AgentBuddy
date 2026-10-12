// The memos feature's onInit and onShutdown run around a test's apps as around the app's run: onInit when the
// first app starts, onShutdown when the last one stops. Declared on the feature, which is what owns the journal.
import { describe, expect, it } from 'vitest';
import { startApp } from '@apackdev/testing/harness';
import { journal } from '../../../../src/features/memos/be/journal.ts';

describe("the feature's lifecycle hooks", () => {
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
    const settingsApp = await startApp({ systems: ['host/settings'] });
    expect(journal.timesOpened).toBe(before + 1);

    memosApp.stop();
    expect(journal.isOpen).toBe(true);
    settingsApp.stop();
    expect(journal.isOpen).toBe(false);
  });

});
