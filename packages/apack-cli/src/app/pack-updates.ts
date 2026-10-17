import { findLatestRelease, readHostCompatibility, type ReleaseCandidate } from '@apackdev/host/packs';
import type { AppEnvironment } from '@apackdev/sdk/env';
import { errorMessage } from '@apackdev/sdk/utils/pure';
import { packInventory } from './installed-packs';

export async function packUpdate(
  { manifest, record }: ReturnType<typeof packInventory>[number],
  { hostVersion, includePrerelease }: { hostVersion?: string; includePrerelease: boolean },
  find = findLatestRelease,
) {
  const base = { id: manifest.id, currentVersion: manifest.version, source: record.installedFrom ?? null };
  if (record.updatesWith === 'app' || !record.installedFrom) {
    return { ...base, status: 'unmanaged' as const, reason: record.updatesWith === 'app' ? 'updates with the app' : 'no recorded GitHub source', candidate: null };
  }
  if (!/^[\w.-]+\/[\w.-]+(?:@[^\s@]+)?$/.test(record.installedFrom)) {
    return { ...base, status: 'error' as const, reason: 'source is not a GitHub slug', candidate: null };
  }
  if (!hostVersion) {
    return { ...base, status: 'error' as const, reason: 'app version is not recorded; open the app with this profile first', candidate: null };
  }
  try {
    const candidate: ReleaseCandidate | null = await find(record.installedFrom, {
      hostVersion, installedVersion: manifest.version, includePrerelease,
    });
    return { ...base, status: candidate ? 'outdated' as const : 'current' as const, candidate, reason: candidate?.hostVersionUnverified ?? null };
  } catch (error) {
    return { ...base, status: 'error' as const, reason: errorMessage(error), candidate: null };
  }
}

export async function packUpdates(context: AppEnvironment, find = findLatestRelease) {
  const hostVersion = readHostCompatibility(context.userDataDir).version;
  const results = [];
  for (const pack of packInventory(context)) {
    results.push(await packUpdate(pack, { hostVersion, includePrerelease: context.env === 'beta' }, find));
  }
  return results;
}
