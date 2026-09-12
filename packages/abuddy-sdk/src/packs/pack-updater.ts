import { createLogger } from '../logger';
import { readPackRegistry, modifyRegistry, type PackRegistryEntry } from './pack-registry';
import * as semver from 'semver';
import { resolveAppContext } from '../env';

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

/**
 * Highest semver release in a GitHub repo. Prereleases (e.g. 1.2.0-beta.1) are only
 * considered for the beta channel; drafts and non-semver tags are ignored.
 */
export async function findLatestRelease(
  slug: string,
  options: { includePrerelease?: boolean } = {},
): Promise<ReleaseCandidate | null> {
  const [ownerRepo] = slug.split('@');
  const [owner, repo] = ownerRepo.split('/');
  if (!owner || !repo) return null;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`,
      { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AgentBuddy' } },
    );
    if (!response.ok) return null;

    const releases = await response.json() as Array<{ tag_name: string; draft?: boolean; prerelease?: boolean }>;
    const candidates = releases
      .filter(r => !r.draft)
      .map(r => ({ tag: r.tag_name, version: semver.clean(r.tag_name.replace(/^v/, '')) }))
      .filter((r): r is ReleaseCandidate => r.version !== null)
      .filter(r => options.includePrerelease || semver.prerelease(r.version) === null)
      .sort((a, b) => semver.rcompare(a.version, b.version));
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

function updateChannelIncludesPrereleases(): boolean {
  try {
    return resolveAppContext().env === 'beta';
  } catch {
    return false;
  }
}

export async function checkForUpdates(): Promise<UpdateCheckResult[]> {
  const entries = readPackRegistry();
  const updatable = entries.filter(e => e.source && e.enabled);

  if (updatable.length === 0) return [];

  const now = Date.now();
  const includePrerelease = updateChannelIncludesPrereleases();
  const results: UpdateCheckResult[] = [];
  const updatedEntries = new Map<string, Partial<PackRegistryEntry>>();

  for (const entry of updatable) {
    if (entry.lastUpdateCheck) {
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

    const latest = await findLatestRelease(entry.source!, { includePrerelease });
    const latestVersion = latest && isNewer(latest.version, entry.version) ? latest.version : undefined;
    updatedEntries.set(entry.id, {
      lastUpdateCheck: new Date().toISOString(),
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
