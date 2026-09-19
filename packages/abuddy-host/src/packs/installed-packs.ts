/**
 * What the app has recorded about the external packs it has.
 *
 * `installed-packs.json` is not the list of installed packs — `packs/<id>/` is, and `enabledExternalPacks`
 * (`pack-discovery.ts`) derives it. This file is a side table keyed by pack id, holding only what the
 * directory cannot say: the user's enabled choice, where an install came from, and what the last seed and
 * update check found. A pack with no row is installed all the same, which is what `abuddy install` and
 * `abuddy dev` leave behind — they write the directory and never this file.
 *
 * Lives outside LMDB because packs must register before EARS hydration. It is not a registry: a registry
 * is the in-process collection packs register into (`createPackRegistry()`), and this is the record on
 * disk.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@abuddy/sdk/logger';
import { resolveAppContext } from '@abuddy/sdk/env';

const logger = createLogger('installed-packs');

/** What the app has recorded about one pack. Every field is something the packs directory cannot answer. */
export interface PackRecord {
  id: string;
  enabled: boolean;
  /** When the app placed it; absent for a pack installed outside the app */
  installedAt?: string;
  /** The GitHub slug an update reinstalls from; absent for a pack installed outside the app */
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
  packs: PackRecord[];
}

function getInstalledPacksPath(): string {
  return resolveAppContext().installedPacksFile;
}

/**
 * What the record says, or that it couldn't be read at all — no file (a fresh data dir, or one last
 * written by a version that kept this somewhere else) or one that won't parse.
 *
 * Most callers want `packRecord` or `packRecords`, which answer for a pack whether or not it has a row.
 * This is for a caller that has to tell "the record says nothing about this pack" from "there is no
 * record to say anything".
 */
export type InstalledPacksRecord =
  | { found: true; packs: PackRecord[] }
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

/** What the app has recorded, by pack id, for the packs it has recorded anything about. */
export function packRecords(): Map<string, PackRecord> {
  const record = readInstalledPacks();
  return new Map((record.found ? record.packs : []).map(e => [e.id, e]));
}

/**
 * What the app has recorded about `id` — a row of defaults when it has recorded nothing.
 *
 * A pack with no row is one nothing has decided anything about yet: enabled, from nowhere in particular,
 * with no seed or update check behind it. Callers get a whole record either way, so none of them repeats
 * what absence means.
 */
export function packRecord(id: string, records = packRecords()): PackRecord {
  return records.get(id) ?? { id, enabled: true };
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

export function writeInstalledPacks(entries: PackRecord[]): void {
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

/** Puts `pack`'s row in `entries`, keeping the `installedAt` of a row already there. */
/**
 * Applies `change` to what is recorded about `id` and writes the result.
 *
 * `change` is given the pack's row, or a row of defaults when it has none, and returns the row to keep or
 * `undefined` for "nothing to record" — which is how a pack that has decided nothing keeps no row at all.
 * Returning the row it was given writes nothing either.
 */
function changeRecord(id: string, change: (record: PackRecord) => PackRecord | undefined): void {
  updateInstalledPacks(entries => {
    const existing = entries.find(e => e.id === id);
    const next = change(existing ?? { id, enabled: true });
    return next === undefined || next === existing ? entries : addInstalledPack(entries, next);
  });
}

/**
 * Records an install: where it came from, and that what it placed is enabled.
 *
 * What an update check last offered goes with it — the pack on disk is now whatever was just installed,
 * so an offer made against the old one says nothing.
 */
export function recordInstalled(id: string, installedFrom?: string): void {
  changeRecord(id, previous => ({
    id,
    enabled: true,
    installedAt: previous.installedAt ?? new Date().toISOString(),
    installedFrom,
  }));
}

/** Records the user's enable or disable choice. */
export function setPackEnabled(id: string, enabled: boolean): void {
  changeRecord(id, record => ({ ...record, enabled }));
}

/** Records what an update check found for a pack, or why it couldn't say. */
export function recordUpdateCheck(id: string, found: Pick<PackRecord, 'availableVersion' | 'availableTag' | 'updateCheckError'>): void {
  changeRecord(id, record => ({ ...record, ...found }));
}

/** Records that the update a check offered is the pack now on disk, so the offer no longer stands. */
export function recordUpdateInstalled(id: string): void {
  changeRecord(id, ({ availableVersion: _version, availableTag: _tag, ...rest }) => rest);
}

/**
 * Records what each seeded pack's seed came to.
 *
 * A row appears only when there is something to say: a pack that seeded cleanly and has no row keeps
 * none, and one whose row carries an error from before has it cleared.
 */
export function recordSeedOutcomes(outcomes: ReadonlyMap<string, string | undefined>): void {
  for (const [id, lastError] of outcomes) {
    changeRecord(id, record => {
      if (lastError) return { ...record, lastError };
      if (!record.lastError) return undefined;
      const { lastError: _cleared, ...rest } = record;
      return rest;
    });
  }
}

/** Drops everything recorded about a pack, for one that is no longer installed. */
export function forgetPack(id: string): void {
  updateInstalledPacks(entries => entries.some(e => e.id === id) ? removeInstalledPack(entries, id) : entries);
}

function addInstalledPack(entries: PackRecord[], pack: PackRecord): PackRecord[] {
  const idx = entries.findIndex(e => e.id === pack.id);
  if (idx < 0) return [...entries, pack];
  const entry: PackRecord = { ...pack, installedAt: pack.installedAt ?? entries[idx].installedAt };
  return [...entries.slice(0, idx), entry, ...entries.slice(idx + 1)];
}

function removeInstalledPack(entries: PackRecord[], id: string): PackRecord[] {
  return entries.filter(e => e.id !== id);
}

function updateInstalledPacks(mutate: (entries: PackRecord[]) => PackRecord[]): PackRecord[] {
  const record = readInstalledPacks();
  // A write over an unreadable record starts from nothing: the row being written is the one fact we have
  const entries = record.found ? record.packs : [];
  const updated = mutate(entries);
  // A mutation that changed nothing writes nothing, so a data dir where nothing has been decided keeps no
  // record at all rather than gaining an empty one
  if (updated !== entries) writeInstalledPacks(updated);
  return updated;
}
