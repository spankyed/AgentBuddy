import { describe, expect, it } from 'vitest';
import { releasesInRange, type GitHubRelease } from '../../src/commands/fetch-deps';

const release = (tag: string): GitHubRelease => ({ tag_name: tag, assets: [] });

describe('releasesInRange', () => {
  it('lists the releases satisfying the range, newest first', () => {
    const releases = [release('v1.0.0'), release('v1.2.0'), release('v2.0.0')];
    expect(releasesInRange(releases, '^1.0.0').map((r) => r.version)).toEqual(['1.2.0', '1.0.0']);
  });

  it('matches prereleases, so a pack whose only releases are betas resolves', () => {
    expect(releasesInRange([release('v0.2.0-beta.0')], '*')[0]?.version).toBe('0.2.0-beta.0');
    expect(releasesInRange([release('v1.1.0-beta.2')], '^1.0.0')[0]?.version).toBe('1.1.0-beta.2');
  });

  it('ignores tags that are not semver, and lists none when nothing matches', () => {
    expect(releasesInRange([release('nightly'), release('v3.0.0')], '^1.0.0')).toEqual([]);
  });
});
