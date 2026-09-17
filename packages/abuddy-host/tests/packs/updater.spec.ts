import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdates, findLatestRelease } from '../../src/packs/pack-updater.ts';
import { readPackRegistry, writePackRegistry } from '../../src/packs/pack-registry.ts';


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

  it('returns null for a bad slug', async () => {
    expect(await findLatestRelease('not-a-slug')).toBeNull();
  });

  it('fails with the cause when GitHub refuses: rate limit, private or missing repository', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('limited', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1900000000' } })));
    await expect(findLatestRelease('acme/pack')).rejects.toThrow(/rate limit is used up until 2030-03-17T17:46:40\.000Z; set GITHUB_TOKEN/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })));
    await expect(findLatestRelease('acme/pack')).rejects.toThrow(/not found: it doesn't exist or it's private; set GITHUB_TOKEN with access to it/);
  });

  it('authenticates with GITHUB_TOKEN and reads private release assets and manifests through the API', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'secret');
    try {
      const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
        if (url.endsWith('/releases?per_page=100')) {
          return new Response(JSON.stringify([
            { tag_name: 'v2.0.0', assets: [{ name: 'p-2.0.0.tgz.bundle.json', url: 'https://api.github.com/repos/acme/pack/releases/assets/7', browser_download_url: 'https://github.com/x' }] },
            { tag_name: 'v1.0.0', assets: [] },
          ]), { status: 200 });
        }
        if (url.endsWith('/assets/7')) return new Response(JSON.stringify({ hostVersion: '>=9.0.0' }), { status: 200 });
        if (url === 'https://api.github.com/repos/acme/pack/contents/abuddy.json?ref=v1.0.0') return new Response(JSON.stringify({ hostVersion: '>=0.1.0' }), { status: 200 });
        return new Response('unexpected', { status: 500 });
      });
      vi.stubGlobal('fetch', fetchMock);
      expect(await findLatestRelease('acme/pack', { hostVersion: '0.4.0' })).toEqual({ version: '1.0.0', tag: 'v1.0.0' });
      expect(fetchMock.mock.calls.map(([, init]) => (init?.headers as Record<string, string>).Authorization)).toEqual(['Bearer secret', 'Bearer secret', 'Bearer secret']);
      expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Accept).toBe('application/octet-stream');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  describe('with a hostVersion', () => {
    /** Releases API plus each tag's abuddy.json (a missing entry is a 404). */
    function mockReleasesWithManifests(manifests: Record<string, { hostVersion?: string }>) {
      const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
        if (url.startsWith('https://api.github.com/')) return new Response(JSON.stringify(releases), { status: 200 });
        const tag = url.match(/\/acme\/pack\/([^/]+)\/abuddy\.json$/)?.[1];
        const manifest = tag && manifests[decodeURIComponent(tag)];
        return manifest ? new Response(JSON.stringify(manifest), { status: 200 }) : new Response('Not Found', { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('skips releases whose manifest requires a different AgentBuddy, and gives every request a timeout', async () => {
      const fetchMock = mockReleasesWithManifests({ 'v1.9.1': { hostVersion: '>=0.5.0' }, 'v1.2.0': { hostVersion: '>=0.3.0' } });
      expect(await findLatestRelease('acme/pack', { hostVersion: '0.4.2' })).toEqual({ version: '1.2.0', tag: 'v1.2.0' });
      expect(fetchMock).toHaveBeenCalledWith('https://raw.githubusercontent.com/acme/pack/v1.9.1/abuddy.json', expect.anything());
      expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit | undefined)?.signal instanceof AbortSignal)).toBe(true);
    });

    it('keeps a release whose manifest has no hostVersion or cannot be read', async () => {
      mockReleasesWithManifests({});
      expect(await findLatestRelease('acme/pack', { hostVersion: '0.4.2' })).toEqual({
        version: '1.9.1', tag: 'v1.9.1', hostVersionUnverified: expect.stringMatching(/abuddy\.json was not found/),
      });
    });

    it('returns null when no release supports this AgentBuddy', async () => {
      mockReleasesWithManifests({ 'v1.9.1': { hostVersion: '>=1.0.0' }, 'v1.2.0': { hostVersion: '>=1.0.0' } });
      expect(await findLatestRelease('acme/pack', { hostVersion: '0.4.2' })).toBeNull();
    });
  });
});

describe('checkForUpdates', () => {
  let userDataDir: string;
  const env = { ABUDDY_ENV: process.env.ABUDDY_ENV, ABUDDY_USER_DATA_DIR: process.env.ABUDDY_USER_DATA_DIR };
  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-'));
    process.env.ABUDDY_ENV = 'test';
    process.env.ABUDDY_USER_DATA_DIR = userDataDir;
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('checks every time, replacing what an earlier check recorded', async () => {
    writePackRegistry([{
      id: 'demo-pack', name: 'Demo', version: '1.0.0', dir: '/packs/demo-pack', enabled: true, registeredAt: '', source: 'acme/pack',
      availableVersion: '1.5.0', availableTag: 'v1.5.0',
    }]);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('https://api.github.com/')
      ? new Response(JSON.stringify([{ tag_name: 'v1.2.0' }]), { status: 200 })
      : new Response(JSON.stringify({ hostVersion: '>=0.4.0' }), { status: 200 })));

    expect(await checkForUpdates({ hostVersion: '0.4.0' })).toEqual([{ packId: 'demo-pack', currentVersion: '1.0.0', availableVersion: '1.2.0', source: 'acme/pack' }]);
    expect(readPackRegistry()[0]).toMatchObject({ availableVersion: '1.2.0', availableTag: 'v1.2.0' });
    expect(readPackRegistry()[0].updateCheckError).toBeUndefined();
  });

  it("says so when every newer release needs a newer AgentBuddy", async () => {
    writePackRegistry([{ id: 'demo-pack', name: 'Demo', version: '1.0.0', dir: '/packs/demo-pack', enabled: true, registeredAt: '', source: 'acme/pack' }]);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('https://api.github.com/')
      ? new Response(JSON.stringify([{ tag_name: 'v2.0.0' }, { tag_name: 'v1.9.0' }]), { status: 200 })
      : new Response(JSON.stringify({ hostVersion: '>=9.0.0' }), { status: 200 })));

    expect(await checkForUpdates({ hostVersion: '0.4.0' })).toEqual([]);
    expect(readPackRegistry()[0]).toMatchObject({ updateCheckError: 'No release of acme/pack supports this AgentBuddy (0.4.0)' });
    expect(readPackRegistry()[0].availableVersion).toBeUndefined();
  });

  it('records why a check failed and checks again next time', async () => {
    writePackRegistry([{ id: 'demo-pack', name: 'Demo', version: '1.0.0', dir: '/packs/demo-pack', enabled: true, registeredAt: '', source: 'acme/pack' }]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('limited', { status: 429, headers: { 'x-ratelimit-remaining': '0' } })));

    expect(await checkForUpdates({ hostVersion: '0.4.0' })).toEqual([]);
    const entry = readPackRegistry()[0];
    expect(entry.updateCheckError).toMatch(/rate limit is used up/);
  });

  it('records a release whose compatibility could not be confirmed', async () => {
    writePackRegistry([{ id: 'demo-pack', name: 'Demo', version: '1.0.0', dir: '/packs/demo-pack', enabled: true, registeredAt: '', source: 'acme/pack' }]);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('https://api.github.com/')
      ? new Response(JSON.stringify([{ tag_name: 'v1.2.0' }]), { status: 200 })
      : new Response('Not Found', { status: 404 })));

    expect(await checkForUpdates({ hostVersion: '0.4.0' })).toHaveLength(1);
    expect(readPackRegistry()[0].updateCheckError).toMatch(/^Couldn't confirm v1\.2\.0 supports this AgentBuddy: .*abuddy\.json was not found/);
  });
});
