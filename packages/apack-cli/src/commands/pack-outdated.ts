import { findLatestRelease, readHostInfo, type ReleaseCandidate } from '@apackdev/host/packs';
import type { AppContext } from '@apackdev/sdk/env';
import { packInventory } from '../app/installed-packs';
import { parseStorageProfile, targetDataContext } from '../utils';

export async function packUpdates(context: AppContext, find = findLatestRelease, packId?: string) {
  const hostVersion = readHostInfo(context.userDataDir).version;
  const results = [];
  for (const { manifest, record } of packInventory(context)) {
    if (packId !== undefined && manifest.id !== packId) continue;
    const base = { id: manifest.id, currentVersion: manifest.version, source: record.installedFrom ?? null };
    if (manifest.builtIn || !record.installedFrom) {
      results.push({ ...base, status: 'unmanaged' as const, reason: manifest.builtIn ? 'ships with the app' : 'no recorded GitHub source', candidate: null });
      continue;
    }
    if (!/^[\w.-]+\/[\w.-]+(?:@[^\s@]+)?$/.test(record.installedFrom)) {
      results.push({ ...base, status: 'error' as const, reason: 'source is not a GitHub slug', candidate: null });
      continue;
    }
    if (!hostVersion) {
      results.push({ ...base, status: 'error' as const, reason: 'app version is not recorded; open the app with this profile first', candidate: null });
      continue;
    }
    try {
      const candidate: ReleaseCandidate | null = await find(record.installedFrom, {
        hostVersion, installedVersion: manifest.version, includePrerelease: context.env === 'beta',
      });
      results.push({ ...base, status: candidate ? 'outdated' as const : 'current' as const, candidate, reason: candidate?.hostVersionUnverified ?? null });
    } catch (error) {
      results.push({ ...base, status: 'error' as const, reason: (error as Error).message, candidate: null });
    }
  }
  return results;
}

export async function outdated(args: string[]): Promise<void> {
  const { env, profile, args: rest } = parseStorageProfile(args);
  if (rest.some(arg => arg !== '--json') || rest.length > 1) throw new Error('Usage: apack pack outdated [--profile <name>] [--json]');
  const results = await packUpdates(targetDataContext(env, profile));
  if (rest.includes('--json')) console.log(JSON.stringify({ packs: results }));
  else if (!results.length) console.log('No packs installed.');
  else for (const row of results) console.log(`${row.id} ${row.currentVersion}: ${row.status}${row.candidate ? ` → ${row.candidate.version}` : ''}${row.reason ? ` (${row.reason})` : ''}`);
  if (results.some(row => row.status === 'error')) throw new Error('Some pack update checks failed.');
}
