// A pack declares the AgentBuddy it needs as `hostVersion`. The rule a beta depends on: a prerelease
// counts as the release it precedes, so the beta of 0.3.15 installs the packs that ask for 0.3.15 —
// the same rule the migrations runner states, where 0.3.15-beta.2 runs the 0.3.15 migrations.
import { describe, expect, it } from 'vitest';
import { isHostCompatible } from '../../src/packs/pack-installer.ts';

describe('a pack\'s hostVersion against the running app', () => {
  it('takes any app when the pack names no range', () => {
    expect(isHostCompatible(undefined, '0.3.15-beta.2')).toBe(true);
  });

  it.each([
    ['0.3.15', '>=0.3.15'],
    ['0.3.16', '>=0.3.15'],
    ['0.3.15', '^0.3.0'],
  ])('installs on a release that satisfies the range (%s / %s)', (app, range) => {
    expect(isHostCompatible(range, app)).toBe(true);
  });

  // Semver orders a prerelease before its release, so `0.3.15-beta.2` does not satisfy `>=0.3.15` on
  // its own. Without normalising, the beta of a release refuses every pack that requires that release
  // — the packs it exists to test.
  it.each([
    ['0.3.15-beta.2', '>=0.3.15'],
    ['0.3.15-beta.1', '^0.3.15'],
    ['0.3.15-rc.1', '>=0.3.15'],
  ])('installs on the beta of the release a pack requires (%s / %s)', (app, range) => {
    expect(isHostCompatible(range, app)).toBe(true);
  });

  it.each([
    ['0.3.14', '>=0.3.15'],
    ['0.3.14-beta.9', '>=0.3.15'],
    ['0.2.0', '^0.3.0'],
  ])('refuses an app older than the range, beta or not (%s / %s)', (app, range) => {
    expect(isHostCompatible(range, app)).toBe(false);
  });

  it('refuses a range it cannot parse rather than throwing', () => {
    expect(isHostCompatible('not a range', '0.3.15')).toBe(false);
  });
});
