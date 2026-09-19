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

/**
 * What `installed-packs.json` says. `found: false` is no readable record at all — no file (a fresh data dir,
 * or one last written by a version that kept this list somewhere else) or one that won't parse.
 *
 * The two are separate cases and not an empty list, because "the record lists no packs" and "there is no
 * record" are opposite answers: the first says a pack is gone, the second says we don't know. A caller
 * deciding what to *delete* has to tell them apart; one that only shows or scans the list writes the
 * fallback out at the call site, where it can be seen.
 */
export type InstalledPacksRecord =
  | { found: true; packs: InstalledPack[] }
  | { found: false };

/** Reads the record in `installedPacksPath` (the app's `installed-packs.json` by default). */
export function readInstalledPacks(installedPacksPath = getInstalledPacksPath()): InstalledPacksRecord {
  if (!fs.existsSync(installedPacksPath)) return { found: false };

  try {
    const data: InstalledPacksFile = JSON.parse(fs.readFileSync(installedPacksPath, 'utf-8'));
    return { found: true, packs: (data.packs ?? []).map(e => ({ ...e, enabled: e.enabled ?? true })) };
  } catch (err) {
    logger.warn('Failed to read the installed packs, starting fresh:', err as Error);
    return { found: false };
  }
}

/**
 * The packs the app has recorded as disabled.
 *
 * An unreadable record means no decisions can be read, and the app carries on with every pack enabled —
 * `readInstalledPacks` has already logged why. A tool reading a data dir the app isn't running on makes
 * the opposite choice (`database/schema.ts`): it refuses, because answering differently from the app
 * would have it read the database by a schema the app can't start with.
 */
export function disabledPackIds(installedPacksPath = getInstalledPacksPath()): ReadonlySet<string> {
  const record = readInstalledPacks(installedPacksPath);
  return new Set(record.found ? record.packs.filter(e => !e.enabled).map(e => e.id) : []);
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

/**
 * Records a pack that is installed and has no entry yet, leaving an existing entry alone.
 *
 * The record is written by whoever installs a pack and rebuilt at boot from the packs directory. The
 * `abuddy dev` reload is the third way a pack becomes installed-and-running (`reloadExternalPack`), and
 * it can load one this app has never seen — so it says so here instead of leaving the pack invisible
 * until the next boot. An existing entry is never touched: it carries the user's enabled choice and
 * where the pack came from, neither of which a reload knows.
 */
export function ensureInstalledPack(pack: Omit<InstalledPack, 'installedAt'>): void {
  const record = readInstalledPacks();
  if (record.found && record.packs.some(e => e.id === pack.id)) return;
  updateInstalledPacks(entries => addInstalledPack(entries, pack));
}

export function updateInstalledPacks(mutate: (entries: InstalledPack[]) => InstalledPack[]): InstalledPack[] {
  const record = readInstalledPacks();
  // A write over an unreadable record starts from nothing: the entry being written is the one fact we have
  const entries = record.found ? record.packs : [];
  const updated = mutate(entries);
  writeInstalledPacks(updated);
  return updated;
}
