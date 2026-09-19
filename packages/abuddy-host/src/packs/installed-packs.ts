/**
 * Installed packs
 *
 * The persistent JSON file recording which external packs are installed, with their
 * install state and enabled/disabled status. Built-in packs don't use this — they load
 * directly from discovery.
 *
 * Lives outside LMDB because packs must register before EARS hydration. It is not a
 * registry: a registry is the in-process collection packs register into
 * (`createPackRegistry()`), and this is the record on disk.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@abuddy/sdk/logger';
import { resolveAppContext } from '@abuddy/sdk/env';

const logger = createLogger('installed-packs');

export interface InstalledPack {
  id: string;
  name: string;
  version: string;
  dir: string;
  enabled: boolean;
  installedAt: string;
  installedFrom?: string;
  availableVersion?: string;
  /** Release tag for availableVersion, so updates install exactly what the check found. */
  availableTag?: string;
  /** Why the pack's last install or boot seed failed; cleared on the next successful seed. */
  lastError?: string;
  /** Why the last update check couldn't finish or confirm compatibility (rate limit, private repo, …) */
  updateCheckError?: string;
}

interface InstalledPacksFile {
  packs: InstalledPack[];
}

function getInstalledPacksPath(): string {
  return resolveAppContext().installedPacksFile;
}

/** The installed external packs' entries (in `installedPacksPath`, the app's `installed-packs.json` by default) */
export function readInstalledPacks(installedPacksPath = getInstalledPacksPath()): InstalledPack[] {
  if (!fs.existsSync(installedPacksPath)) return [];

  try {
    const data: InstalledPacksFile = JSON.parse(fs.readFileSync(installedPacksPath, 'utf-8'));
    return (data.packs ?? []).map(e => ({
      ...e,
      enabled: e.enabled ?? true,
    }));
  } catch (err) {
    logger.warn('Failed to read the installed packs, starting fresh:', err as Error);
    return [];
  }
}

export function writeInstalledPacks(entries: InstalledPack[]): void {
  const installedPacksPath = getInstalledPacksPath();
  const dir = path.dirname(installedPacksPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const data: InstalledPacksFile = { packs: entries };
  const tmpPath = installedPacksPath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, installedPacksPath);
  } catch (err) {
    logger.error('Failed to write the installed packs:', err as Error);
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

export function addInstalledPack(entries: InstalledPack[], pack: Omit<InstalledPack, 'installedAt'>): InstalledPack[] {
  const idx = entries.findIndex(e => e.id === pack.id);
  if (idx >= 0) {
    const entry: InstalledPack = { ...pack, installedAt: entries[idx].installedAt };
    return [...entries.slice(0, idx), entry, ...entries.slice(idx + 1)];
  }
  const entry: InstalledPack = { ...pack, installedAt: new Date().toISOString() };
  return [...entries, entry];
}

export function removeInstalledPack(entries: InstalledPack[], id: string): InstalledPack[] {
  return entries.filter(e => e.id !== id);
}

export function updateInstalledPacks(mutate: (entries: InstalledPack[]) => InstalledPack[]): InstalledPack[] {
  const entries = readInstalledPacks();
  const updated = mutate(entries);
  writeInstalledPacks(updated);
  return updated;
}
