import { describe, expect, it } from 'vitest';
import { pickRelease, type GitHubRelease } from '../../src/commands/fetch-deps';

const release = (tag: string): GitHubRelease => ({ tag_name: tag, assets: [] });

describe('pickRelease', () => {
  it('takes the newest release satisfying the range', () => {
    const releases = [release('v1.0.0'), release('v1.2.0'), release('v2.0.0')];
    expect(pickRelease(releases, '^1.0.0')?.version).toBe('1.2.0');
  });

  it('matches prereleases, so a pack whose only releases are betas resolves', () => {
    expect(pickRelease([release('v0.2.0-beta.0')], '*')?.version).toBe('0.2.0-beta.0');
    expect(pickRelease([release('v1.1.0-beta.2')], '^1.0.0')?.version).toBe('1.1.0-beta.2');
  });

  it('ignores tags that are not semver, and returns null when nothing matches', () => {
    expect(pickRelease([release('nightly'), release('v3.0.0')], '^1.0.0')).toBeNull();
  });
});
