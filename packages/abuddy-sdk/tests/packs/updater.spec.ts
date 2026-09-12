import { afterEach, describe, expect, it, vi } from 'vitest';
import { findLatestRelease } from '../../src/packs/pack-updater';

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
});
