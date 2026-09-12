import { createLogger } from '../logger';
import { readPackRegistry, modifyRegistry, type PackRegistryEntry } from './pack-registry';
import { compareVersions } from '../utils';

const logger = createLogger('pack-updater');

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface UpdateCheckResult {
  packId: string;
  currentVersion: string;
  availableVersion: string;
  source: string;
}

async function checkGitHubLatest(slug: string): Promise<string | null> {
  const [ownerRepo] = slug.split('@');
  const [owner, repo] = ownerRepo.split('/');
  if (!owner || !repo) return null;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
      { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AgentBuddy' } },
    );
    if (!response.ok) return null;

    const release = await response.json() as { tag_name: string };
    return release.tag_name?.replace(/^v/, '') ?? null;
  } catch {
    return null;
  }
}

export async function checkForUpdates(): Promise<UpdateCheckResult[]> {
  const entries = readPackRegistry();
  const updatable = entries.filter(e => e.source && e.enabled);

  if (updatable.length === 0) return [];

  const now = Date.now();
  const results: UpdateCheckResult[] = [];
  const updatedEntries = new Map<string, Partial<PackRegistryEntry>>();

  for (const entry of updatable) {
    if (entry.lastUpdateCheck) {
      const lastCheck = new Date(entry.lastUpdateCheck).getTime();
      if (now - lastCheck < UPDATE_CHECK_INTERVAL_MS) {
        if (entry.availableVersion && compareVersions(entry.availableVersion, entry.version) > 0) {
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

    const latestVersion = await checkGitHubLatest(entry.source!);
    updatedEntries.set(entry.id, {
      lastUpdateCheck: new Date().toISOString(),
      availableVersion: latestVersion ?? undefined,
    });

    if (latestVersion && compareVersions(latestVersion, entry.version) > 0) {
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
    .filter(e => e.availableVersion && e.source && compareVersions(e.availableVersion, e.version) > 0)
    .map(e => ({
      packId: e.id,
      currentVersion: e.version,
      availableVersion: e.availableVersion!,
      source: e.source!,
    }));
}
