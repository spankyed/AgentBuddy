// The browser feature holds its own settings, as the other nine do. It was the one feature that never handled
// `FEATURE_SETTINGS_UPDATED`, so it reached into the settings plugin's actor instead — from a machine action,
// where no composable can run. That is what this replaces.
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import browserState from '@/features/browser/fe/state';

const started = () => {
  const actor = createActor(browserState);
  actor.start();
  return actor;
};

describe("the browser plugin's own settings", () => {
  it('starts with none and takes them from the app', () => {
    const actor = started();
    expect(actor.getSnapshot().context.settings).toEqual({});

    actor.send({ type: 'FEATURE_SETTINGS_UPDATED', settings: { showBookmarksBar: false, openLinksInApp: false } });

    expect(actor.getSnapshot().context.settings).toEqual({ showBookmarksBar: false, openLinksInApp: false });
    actor.stop();
  });

  it('keeps the last settings the app sent', () => {
    const actor = started();

    actor.send({ type: 'FEATURE_SETTINGS_UPDATED', settings: { showBookmarksBar: true } });
    actor.send({ type: 'FEATURE_SETTINGS_UPDATED', settings: { showBookmarksBar: false } });

    expect(actor.getSnapshot().context.settings.showBookmarksBar).toBe(false);
    actor.stop();
  });
});
