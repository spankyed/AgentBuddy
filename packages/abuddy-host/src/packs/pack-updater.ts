import { createLogger } from '@abuddy/sdk/logger';
import { readInstalledPacks, updateInstalledPacks, type InstalledPack } from './installed-packs.ts';
import * as semver from 'semver';
import { resolveAppContext } from '@abuddy/sdk/env';
import { isHostCompatible } from './pack-installer.ts';
import { fetchReleaseAsset, fetchRepoFile, githubFetch, type GitHubReleaseAsset } from './github.ts';

const logger = createLogger('pack-updater');

export interface UpdateCheckResult {
  packId: string;
  currentVersion: string;
  availableVersion: string;
  installedFrom: string;
}

export interface ReleaseCandidate {
  version: string;
  tag: string;
  /** Set when the release's hostVersion couldn't be read: why. The installer checks it again. */
  hostVersionUnverified?: string;
}

interface GitHubRelease {
  tag_name: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubReleaseAsset[];
}

/**
 * Newest semver release in a GitHub repo that this AgentBuddy can run. Prereleases — by tag (e.g.
 * 1.2.0-beta.1) or by GitHub's own `prerelease` flag — are only considered for the beta channel;
 * drafts and non-semver tags are ignored,
 * and so are releases not newer than `installedVersion`. With a hostVersion, each candidate's
 * range is read, newest first, from its `<archive>.integrity.json` asset (`abuddy release` uploads it),
 * else from abuddy.json at its tag; a candidate whose range can't be read is returned with
 * `hostVersionUnverified`, and the installer checks it again.
 * A failing release list (rate limit, private or missing repository) throws GitHubRequestError.
 */
export async function findLatestRelease(
  slug: string,
  options: { includePrerelease?: boolean; hostVersion?: string; installedVersion?: string } = {},
): Promise<ReleaseCandidate | null> {
  const [ownerRepo] = slug.split('@');
  const [owner, repo] = ownerRepo.split('/');
  if (!owner || !repo) return null;

  const releases = await (await githubFetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`)).json() as GitHubRelease[];
  const installed = options.installedVersion ? semver.valid(options.installedVersion) : null;
  const candidates = releases
    .filter(r => !r.draft)
    .map(r => ({ release: r, tag: r.tag_name, version: semver.clean(r.tag_name.replace(/^v/, '')) }))
    .filter((r): r is { release: GitHubRelease; tag: string; version: string } => r.version !== null)
    // A release is a prerelease if its tag says so OR GitHub is flagged as one: a maintainer can
    // tag `1.2.0` and mark the release pre-release, and going by the tag alone offers it as stable
    .filter(r => options.includePrerelease || (semver.prerelease(r.version) === null && !r.release.prerelease))
    .filter(r => !installed || semver.gt(r.version, installed))
    .sort((a, b) => semver.rcompare(a.version, b.version));
  if (!options.hostVersion) return candidates[0] ? { version: candidates[0].version, tag: candidates[0].tag } : null;

  /** The release's hostVersion range, or why it couldn't be read */
  const hostRange = async (release: GitHubRelease): Promise<{ range?: string; unread?: string }> => {
    const asset = release.assets?.find(a => a.name.endsWith('.integrity.json'));
    const sources = [
      ...(asset ? [() => fetchReleaseAsset(asset)] : []),
      () => fetchRepoFile(owner, repo, release.tag_name, 'abuddy.json'),
    ];
    let unread = 'no manifest to read it from';
    for (const source of sources) {
      try {
        const { hostVersion } = await (await source()).json() as { hostVersion?: unknown };
        return { range: typeof hostVersion === 'string' ? hostVersion : undefined };
      } catch (err) {
        unread = err instanceof Error ? err.message : String(err);
      }
    }
    return { unread };
  };
  for (const candidate of candidates) {
    const { range, unread } = await hostRange(candidate.release);
    if (isHostCompatible(range, options.hostVersion)) {
      return { version: candidate.version, tag: candidate.tag, ...(unread ? { hostVersionUnverified: unread } : {}) };
    }
  }
  return null;
}

function updateChannelIncludesPrereleases(): boolean {
  try {
    return resolveAppContext().env === 'beta';
  } catch {
    return false;
  }
}

/**
 * Checks each installed pack's source for a newer release this AgentBuddy (hostVersion) can run, and
 * records what it found on the registry entry (`availableVersion`/`availableTag`, or `updateCheckError`
 * saying why there's nothing to offer). Nothing is cached: the Packs view runs this when asked.
 */
export async function checkForUpdates(options: { hostVersion?: string } = {}): Promise<UpdateCheckResult[]> {
  const entries = readInstalledPacks();
  const updatable = entries.filter(e => e.installedFrom && e.enabled);

  if (updatable.length === 0) return [];

  const includePrerelease = updateChannelIncludesPrereleases();
  const results: UpdateCheckResult[] = [];
  const updatedEntries = new Map<string, Partial<InstalledPack>>();

  for (const entry of updatable) {
    let latest: ReleaseCandidate | null;
    try {
      latest = await findLatestRelease(entry.installedFrom!, { includePrerelease, hostVersion: options.hostVersion, installedVersion: entry.version });
    } catch (err) {
      // Not checked: kept out of the cache so the next check tries again
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Update check for ${entry.id} failed: ${message}`);
      updatedEntries.set(entry.id, { updateCheckError: message });
      continue;
    }
    const latestVersion = latest && isNewer(latest.version, entry.version) ? latest.version : undefined;
    const unverified = latestVersion ? latest!.hostVersionUnverified : undefined;
    if (unverified) logger.warn(`${entry.id} v${latestVersion}: couldn't read its hostVersion (${unverified}); installing it checks again`);
    // Nothing newer to offer, with a newer release out there: say the releases need a newer AgentBuddy
    const noneCompatible = !latest && options.hostVersion
      ? `No release of ${entry.installedFrom} supports this AgentBuddy (${options.hostVersion})`
      : undefined;
    updatedEntries.set(entry.id, {
      availableVersion: latestVersion,
      availableTag: latestVersion ? latest!.tag : undefined,
      updateCheckError: unverified ? `Couldn't confirm v${latestVersion} supports this AgentBuddy: ${unverified}` : noneCompatible,
    });

    if (latestVersion) {
      results.push({
        packId: entry.id,
        currentVersion: entry.version,
        availableVersion: latestVersion,
        installedFrom: entry.installedFrom!,
      });
    }
  }

  if (updatedEntries.size > 0) {
    updateInstalledPacks(entries =>
      entries.map(e => {
        const update = updatedEntries.get(e.id);
        return update ? { ...e, ...update } : e;
      }),
    );
  }

  logger.info(`Update check complete: ${results.length} update(s) available`);
  return results;
}

export function getAvailableUpdates(): UpdateCheckResult[] {
  const entries = readInstalledPacks();
  return entries
    .filter(e => e.availableVersion && e.installedFrom && isNewer(e.availableVersion, e.version))
    .map(e => ({
      packId: e.id,
      currentVersion: e.version,
      availableVersion: e.availableVersion!,
      installedFrom: e.installedFrom!,
    }));
}

function isNewer(candidate: string, current: string): boolean {
  const a = semver.valid(candidate);
  const b = semver.valid(current);
  return a !== null && b !== null && semver.gt(a, b);
}
