import { createLogger } from '@abuddy/sdk/logger';
import { readPackRegistry, modifyRegistry, type PackRegistryEntry } from './pack-registry.ts';
import * as semver from 'semver';
import { resolveAppContext } from '@abuddy/sdk/env';
import { isHostCompatible } from './pack-installer.ts';
import { fetchReleaseAsset, fetchRepoFile, githubFetch, type GitHubReleaseAsset } from './github.ts';

const logger = createLogger('pack-updater');

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface UpdateCheckResult {
  packId: string;
  currentVersion: string;
  availableVersion: string;
  source: string;
}

export interface ReleaseCandidate {
  version: string;
  tag: string;
  /** Set when the release's hostVersion couldn't be read: why. The installer checks it again. */
  hostVersionUnverified?: string;
}

/** Release manifests (bundle.json assets or abuddy.json) a single check reads at most */
const MAX_MANIFEST_FETCHES = 10;

interface GitHubRelease {
  tag_name: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubReleaseAsset[];
}

/**
 * Newest semver release in a GitHub repo that this AgentBuddy can run. Prereleases (e.g.
 * 1.2.0-beta.1) are only considered for the beta channel; drafts and non-semver tags are ignored,
 * and so are releases not newer than `installedVersion`. With a hostVersion, each candidate's
 * range is read from its `<archive>.bundle.json` asset (`abuddy release` uploads it), else from
 * abuddy.json at its tag; a candidate whose range can't be read is returned with
 * `hostVersionUnverified`. At most MAX_MANIFEST_FETCHES ranges are read, newest first.
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
    .filter(r => options.includePrerelease || semver.prerelease(r.version) === null)
    .filter(r => !installed || semver.gt(r.version, installed))
    .sort((a, b) => semver.rcompare(a.version, b.version));
  if (!options.hostVersion) return candidates[0] ? { version: candidates[0].version, tag: candidates[0].tag } : null;

  let fetches = 0;
  /** The release's hostVersion range, or why it couldn't be read */
  const hostRange = async (release: GitHubRelease): Promise<{ range?: string; unread?: string }> => {
    const asset = release.assets?.find(a => a.name.endsWith('.bundle.json'));
    const sources = [
      ...(asset ? [() => fetchReleaseAsset(asset)] : []),
      () => fetchRepoFile(owner, repo, release.tag_name, 'abuddy.json'),
    ];
    let unread = `the manifest fetch limit (${MAX_MANIFEST_FETCHES}) was reached`;
    for (const source of sources) {
      if (fetches >= MAX_MANIFEST_FETCHES) break;
      fetches++;
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
    if (fetches >= MAX_MANIFEST_FETCHES) break;
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

/** Checks each installed pack's source for a newer release this AgentBuddy (hostVersion) can run. */
export async function checkForUpdates(options: { hostVersion?: string } = {}): Promise<UpdateCheckResult[]> {
  const entries = readPackRegistry();
  const updatable = entries.filter(e => e.source && e.enabled);

  if (updatable.length === 0) return [];

  const now = Date.now();
  const includePrerelease = updateChannelIncludesPrereleases();
  const results: UpdateCheckResult[] = [];
  const updatedEntries = new Map<string, Partial<PackRegistryEntry>>();

  for (const entry of updatable) {
    // A result checked by another AgentBuddy version may not apply to this one
    if (entry.lastUpdateCheck && entry.lastUpdateCheckHostVersion === options.hostVersion) {
      const lastCheck = new Date(entry.lastUpdateCheck).getTime();
      if (now - lastCheck < UPDATE_CHECK_INTERVAL_MS) {
        if (entry.availableVersion && isNewer(entry.availableVersion, entry.version)) {
          results.push({
            packId: entry.id,
            currentVersion: entry.version,
            availableVersion: entry.availableVersion,
            source: entry.source!,
          });
        }
        continue;
      }
    }

    let latest: ReleaseCandidate | null;
    try {
      latest = await findLatestRelease(entry.source!, { includePrerelease, hostVersion: options.hostVersion, installedVersion: entry.version });
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
    updatedEntries.set(entry.id, {
      lastUpdateCheck: new Date().toISOString(),
      lastUpdateCheckHostVersion: options.hostVersion,
      availableVersion: latestVersion,
      availableTag: latestVersion ? latest!.tag : undefined,
      updateCheckError: unverified ? `Couldn't confirm v${latestVersion} supports this AgentBuddy: ${unverified}` : undefined,
    });

    if (latestVersion) {
      results.push({
        packId: entry.id,
        currentVersion: entry.version,
        availableVersion: latestVersion,
        source: entry.source!,
      });
    }
  }

  if (updatedEntries.size > 0) {
    modifyRegistry(entries =>
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
  const entries = readPackRegistry();
  return entries
    .filter(e => e.availableVersion && e.source && isNewer(e.availableVersion, e.version))
    .map(e => ({
      packId: e.id,
      currentVersion: e.version,
      availableVersion: e.availableVersion!,
      source: e.source!,
    }));
}

function isNewer(candidate: string, current: string): boolean {
  const a = semver.valid(candidate);
  const b = semver.valid(current);
  return a !== null && b !== null && semver.gt(a, b);
}
