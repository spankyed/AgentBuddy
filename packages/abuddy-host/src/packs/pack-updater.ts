import { createLogger } from '@abuddy/sdk/logger';
import { readPackRegistry, modifyRegistry, type PackRegistryEntry } from './pack-registry.ts';
import * as semver from 'semver';
import { resolveAppContext } from '@abuddy/sdk/env';
import { isHostCompatible } from './pack-installer.ts';

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
}

/** Release manifests (bundle.json assets or abuddy.json) a single check reads at most */
const MAX_MANIFEST_FETCHES = 10;
const FETCH_TIMEOUT_MS = 10_000;

interface GitHubRelease {
  tag_name: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{ name: string; browser_download_url: string }>;
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

/**
 * Newest semver release in a GitHub repo that this AgentBuddy can run. Prereleases (e.g.
 * 1.2.0-beta.1) are only considered for the beta channel; drafts and non-semver tags are ignored,
 * and so are releases not newer than `installedVersion`. With a hostVersion, each candidate's
 * range is read from its `<archive>.bundle.json` asset (`abuddy release` uploads it), else from
 * abuddy.json at its tag; a candidate whose range can't be read is kept (the installer checks it
 * again). At most MAX_MANIFEST_FETCHES ranges are read, newest first.
 */
export async function findLatestRelease(
  slug: string,
  options: { includePrerelease?: boolean; hostVersion?: string; installedVersion?: string } = {},
): Promise<ReleaseCandidate | null> {
  const [ownerRepo] = slug.split('@');
  const [owner, repo] = ownerRepo.split('/');
  if (!owner || !repo) return null;

  let releases: GitHubRelease[];
  try {
    releases = await fetchJson(
      `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`,
      { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AgentBuddy' },
    ) as GitHubRelease[];
  } catch {
    return null;
  }
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
  /** The release's hostVersion range; undefined when it has none or can't be read */
  const hostRange = async (release: GitHubRelease): Promise<string | undefined> => {
    const asset = release.assets?.find(a => a.name.endsWith('.bundle.json'));
    const urls = [
      ...(asset ? [asset.browser_download_url] : []),
      `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(release.tag_name)}/abuddy.json`,
    ];
    for (const url of urls) {
      if (fetches >= MAX_MANIFEST_FETCHES) return undefined;
      fetches++;
      try {
        const { hostVersion } = await fetchJson(url) as { hostVersion?: unknown };
        return typeof hostVersion === 'string' ? hostVersion : undefined;
      } catch {
        // Next source
      }
    }
    return undefined;
  };
  for (const candidate of candidates) {
    if (fetches >= MAX_MANIFEST_FETCHES) break;
    if (isHostCompatible(await hostRange(candidate.release), options.hostVersion)) {
      return { version: candidate.version, tag: candidate.tag };
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

    const latest = await findLatestRelease(entry.source!, { includePrerelease, hostVersion: options.hostVersion, installedVersion: entry.version });
    const latestVersion = latest && isNewer(latest.version, entry.version) ? latest.version : undefined;
    updatedEntries.set(entry.id, {
      lastUpdateCheck: new Date().toISOString(),
      lastUpdateCheckHostVersion: options.hostVersion,
      availableVersion: latestVersion,
      availableTag: latestVersion ? latest!.tag : undefined,
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
