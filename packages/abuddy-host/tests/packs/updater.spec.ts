import { afterEach, describe, expect, it, vi } from 'vitest';
import { findLatestRelease } from '../../src/packs/pack-updater.ts';

function mockReleases(releases: Array<{ tag_name: string; draft?: boolean; prerelease?: boolean }>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(releases), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findLatestRelease', () => {
  const releases = [
    { tag_name: 'v1.2.0' },
    { tag_name: 'v1.10.0-beta.2', prerelease: true },
    { tag_name: 'v1.9.1' },
    { tag_name: 'v2.0.0', draft: true },
    { tag_name: 'nightly' },
  ];

  it('picks the highest stable semver release, ignoring drafts and non-semver tags', async () => {
    const fetchMock = mockReleases(releases);
    expect(await findLatestRelease('acme/pack')).toEqual({ version: '1.9.1', tag: 'v1.9.1' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/acme/pack/releases?per_page=100', expect.anything());
  });

  it('includes prereleases for the beta channel', async () => {
    mockReleases(releases);
    expect(await findLatestRelease('acme/pack', { includePrerelease: true })).toEqual({ version: '1.10.0-beta.2', tag: 'v1.10.0-beta.2' });
  });

  it('returns null for a bad slug or API failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect(await findLatestRelease('acme/pack')).toBeNull();
    expect(await findLatestRelease('not-a-slug')).toBeNull();
  });

  describe('with a hostVersion', () => {
    /** Releases API plus each tag's abuddy.json (a missing entry is a 404). */
    function mockReleasesWithManifests(manifests: Record<string, { hostVersion?: string }>) {
      const fetchMock = vi.fn(async (url: string) => {
        if (url.startsWith('https://api.github.com/')) return new Response(JSON.stringify(releases), { status: 200 });
        const tag = url.match(/\/acme\/pack\/([^/]+)\/abuddy\.json$/)?.[1];
        const manifest = tag && manifests[decodeURIComponent(tag)];
        return manifest ? new Response(JSON.stringify(manifest), { status: 200 }) : new Response('Not Found', { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('skips releases whose manifest requires a different AgentBuddy', async () => {
      const fetchMock = mockReleasesWithManifests({ 'v1.9.1': { hostVersion: '>=0.5.0' }, 'v1.2.0': { hostVersion: '>=0.3.0' } });
      expect(await findLatestRelease('acme/pack', { hostVersion: '0.4.2' })).toEqual({ version: '1.2.0', tag: 'v1.2.0' });
      expect(fetchMock).toHaveBeenCalledWith('https://raw.githubusercontent.com/acme/pack/v1.9.1/abuddy.json');
    });

    it('keeps a release whose manifest has no hostVersion or cannot be read', async () => {
      mockReleasesWithManifests({});
      expect(await findLatestRelease('acme/pack', { hostVersion: '0.4.2' })).toEqual({ version: '1.9.1', tag: 'v1.9.1' });
    });

    it('returns null when no release supports this AgentBuddy', async () => {
      mockReleasesWithManifests({ 'v1.9.1': { hostVersion: '>=1.0.0' }, 'v1.2.0': { hostVersion: '>=1.0.0' } });
      expect(await findLatestRelease('acme/pack', { hostVersion: '0.4.2' })).toBeNull();
    });
  });
});
