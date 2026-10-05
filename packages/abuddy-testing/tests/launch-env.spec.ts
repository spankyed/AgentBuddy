// The environment the fixture hands the app under test: what it must strip from the runner's own.
//
// It lived in @abuddy/cli's app-target spec, which tests the CLI's `abuddy test` target resolution and
// imported this from here to cover the two together. `appLaunchEnv` is this package's, and a pure function,
// so it is checked here and the CLI's spec keeps only what is the CLI's.
import { describe, expect, it } from 'vitest';
import { appLaunchEnv, pinsViewport } from '../src/launch-env.ts';

describe('appLaunchEnv', () => {
  it("doesn't pass the app-bundled launcher's ELECTRON_RUN_AS_NODE to the app under test", () => {
    expect(appLaunchEnv({ ELECTRON_RUN_AS_NODE: '1', HOME: '/home' }, '/tmp/data')).toEqual({
      HOME: '/home',
      PLAYWRIGHT_TEST: 'true',
      ABUDDY_USER_DATA_DIR: '/tmp/data',
    });
  });

  it("doesn't pass the runner's @abuddy/source condition to the app", () => {
    expect(appLaunchEnv({ NODE_OPTIONS: '--max-old-space-size=4096 --conditions=@abuddy/source' }, '/tmp/data').NODE_OPTIONS)
      .toBe('--max-old-space-size=4096');
    expect(appLaunchEnv({ NODE_OPTIONS: '--conditions=@abuddy/source' }, '/tmp/data')).not.toHaveProperty('NODE_OPTIONS');
  });
});

/**
 * Playwright emulates a viewport inside the real window rather than resizing it, so a pinned one leaves
 * the rest of a *shown* window empty with the desktop behind it — which is what driving looked like, and
 * reads as a broken app. A suite nobody watches still wants the determinism.
 */
describe('pinsViewport', () => {
  it('pins for a run nobody is watching, so baselines match everywhere', () => {
    expect(pinsViewport({})).toBe(true);
    expect(pinsViewport({ PLAYWRIGHT_TEST: 'true' })).toBe(true);
  });

  it('leaves a shown window its own size', () => {
    expect(pinsViewport({ PLAYWRIGHT_VISIBLE: '1' })).toBe(false);
  });

  it('pins for any other value, since only the flag the app reads turns it off', () => {
    // `WindowManager` and `ProtocolHandler` both compare against '1'; anything else is not the flag
    expect(pinsViewport({ PLAYWRIGHT_VISIBLE: 'true' })).toBe(true);
    expect(pinsViewport({ PLAYWRIGHT_VISIBLE: '' })).toBe(true);
  });
});
