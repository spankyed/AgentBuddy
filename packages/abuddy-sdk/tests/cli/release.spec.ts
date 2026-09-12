import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextReleaseVersion, preflight, publishRelease, type Runner } from '../../src/cli/commands/release';
import { packBundle } from '../../src/cli/commands/pack';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-spec-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function builtPack(version = '1.2.3'): string {
  const root = path.join(tmp, 'pack');
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  write('abuddy.json', JSON.stringify({ id: 'demo-pack', name: 'Demo Pack', version, hostVersion: '>=0.3.0' }));
  write('dist/runtime/index.cjs', 'module.exports = { registration: { id: "demo-pack", systems: [] } };');
  write('dist/types/snapshot.json', '{}');
  return root;
}

/** Fake git: answers from a table, records every call, never touches a repo. */
function fakeGit(answers: Record<string, string | Error>): Runner & { calls: string[] } {
  const calls: string[] = [];
  const run: Runner = (cmd, args) => {
    const key = [cmd, ...args].join(' ');
    calls.push(key);
    const answer = answers[key];
    if (answer instanceof Error) throw answer;
    return answer ?? '';
  };
  return Object.assign(run, { calls });
}

describe('nextReleaseVersion', () => {
  it.each([
    ['1.2.3', 'patch', false, '1.2.4'],
    ['1.2.3', 'minor', false, '1.3.0'],
    ['1.2.3', 'major', false, '2.0.0'],
    ['1.2.3', 'patch', true, '1.2.4-beta.0'],
    ['1.2.3', 'minor', true, '1.3.0-beta.0'],
    ['1.2.4-beta.0', 'patch', true, '1.2.4-beta.1'],
    ['1.2.4-beta.1', 'patch', false, '1.2.4'],
  ] as const)('%s + %s (beta=%s) → %s', (current, bump, beta, expected) => {
    expect(nextReleaseVersion(current, bump, beta)).toBe(expected);
  });

  it('rejects a non-semver current version', () => {
    expect(() => nextReleaseVersion('one', 'patch', false)).toThrow(/not valid semver/);
  });
});

describe('preflight', () => {
  const cleanRepo = {
    'git rev-parse --is-inside-work-tree': 'true',
    'git status --porcelain': '',
    'git rev-parse --abbrev-ref HEAD': 'main',
    'git symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main',
    'git remote get-url origin': 'git@github.com:acme/demo-pack.git',
  };

  it('passes a clean default-branch repo with a token for --local', async () => {
    const root = builtPack();
    fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(root, '.github', 'workflows', 'release.yml'), '');
    const result = await preflight(root, { local: true, run: fakeGit(cleanRepo), env: { GITHUB_TOKEN: 't' } });
    expect(result).toEqual({ errors: [], warnings: [] });
  });

  it('reports every problem at once', async () => {
    const root = builtPack();
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'abuddy.json'), 'utf-8'));
    delete manifest.hostVersion;
    fs.writeFileSync(path.join(root, 'abuddy.json'), JSON.stringify(manifest));

    const run = fakeGit({
      ...cleanRepo,
      'git status --porcelain': ' M src/index.ts',
      'git rev-parse --abbrev-ref HEAD': 'feature/x',
      'git remote get-url origin': new Error('no remote'),
    });
    const { errors, warnings } = await preflight(root, { local: true, run, env: {} });
    expect(errors).toEqual([
      'abuddy.json: hostVersion is required for releases (e.g. ">=0.3.0")',
      'working tree has uncommitted changes',
      'on branch "feature/x"; releases are cut from "main"',
      'no "origin" remote to push the release tag to',
      '--local publishing needs GITHUB_TOKEN or GH_TOKEN',
    ]);
    expect(warnings).toEqual([]);
  });

  it('warns when publishing relies on a release workflow that does not exist', async () => {
    const { warnings } = await preflight(builtPack(), { local: false, run: fakeGit(cleanRepo), env: {} });
    expect(warnings).toEqual([expect.stringMatching(/no \.github\/workflows\/release\.yml/)]);
  });
});

describe('publishRelease', () => {
  function mockOctokit() {
    const createRelease = vi.fn(async () => ({ data: { id: 42 } }));
    const uploadReleaseAsset = vi.fn(async () => ({ data: {} }));
    return { octokit: { rest: { repos: { createRelease, uploadReleaseAsset } } } as any, createRelease, uploadReleaseAsset };
  }

  it('creates a prerelease for beta versions and uploads the archive and checksum', async () => {
    const root = builtPack('1.3.0-beta.2');
    const releaseDir = path.join(tmp, 'release');
    await packBundle(root, releaseDir);
    const { octokit, createRelease, uploadReleaseAsset } = mockOctokit();

    const result = await publishRelease(root, releaseDir, { octokit, env: { GITHUB_REPOSITORY: 'acme/demo-pack' }, run: fakeGit({}) });

    expect(result).toEqual({ tag: 'v1.3.0-beta.2', prerelease: true });
    expect(createRelease).toHaveBeenCalledWith(expect.objectContaining({ owner: 'acme', repo: 'demo-pack', tag_name: 'v1.3.0-beta.2', prerelease: true }));
    expect(uploadReleaseAsset.mock.calls.map(([arg]: any[]) => arg.name)).toEqual(['demo-pack-1.3.0-beta.2.tgz', 'demo-pack-1.3.0-beta.2.tgz.sha256']);
  });

  it('refuses to publish an archive that fails verification', async () => {
    const root = builtPack('1.0.0');
    const releaseDir = path.join(tmp, 'release');
    await packBundle(root, releaseDir);
    fs.writeFileSync(path.join(releaseDir, 'demo-pack-1.0.0.tgz.sha256'), `${'0'.repeat(64)}  demo-pack-1.0.0.tgz\n`);
    const { octokit, createRelease } = mockOctokit();

    await expect(publishRelease(root, releaseDir, { octokit, env: { GITHUB_REPOSITORY: 'acme/demo-pack' }, run: fakeGit({}) })).rejects.toThrow(/Checksum mismatch/);
    expect(createRelease).not.toHaveBeenCalled();
  });

  it('dry-run resolves the repository from origin and publishes nothing', async () => {
    const root = builtPack('2.0.0');
    const releaseDir = path.join(tmp, 'release');
    await packBundle(root, releaseDir);
    const { octokit, createRelease } = mockOctokit();

    const result = await publishRelease(root, releaseDir, {
      dryRun: true,
      octokit,
      env: {},
      run: fakeGit({ 'git remote get-url origin': 'https://github.com/acme/demo-pack.git' }),
    });
    expect(result).toEqual({ tag: 'v2.0.0', prerelease: false });
    expect(createRelease).not.toHaveBeenCalled();
  });
});
