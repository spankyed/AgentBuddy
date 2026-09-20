import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { recordHostVersion } from './host-info.ts';
import { _recordIsStale } from '@abuddy/sdk/env';

export type StagingKind = 'installing' | 'previous' | 'publishing';

/** `.<id>.<kind>-<pid>` or `.<id>.<kind>-<pid>-<random>`: staging owned by a process */
const OWNED_STAGING_DIR = /^\.(.+)\.(installing|previous|publishing)-(\d+)(?:-[A-Za-z0-9]+)?$/;

/**
 * A hidden staging dir name for pack `id`, unique to this process: a crashed process's leftovers
 * never collide with a later process that reuses its PID.
 */
export function stagingDirName(id: string, kind: StagingKind): string {
  return `.${id}.${kind}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
}

interface StagingEntry { name: string; id: string; kind: StagingKind; stale: boolean }

/**
 * A staging dir and whether the process that made it is gone: its PID isn't running, or the dir predates
 * this boot, which a later process reusing that PID would otherwise hide.
 */
function parseStagingDir(dir: string, name: string): StagingEntry | null {
  const owned = OWNED_STAGING_DIR.exec(name);
  if (!owned) return null;
  const pid = Number(owned[3]);
  const stale = pid !== process.pid && _recordIsStale(path.join(dir, name), pid);
  return { name, id: owned[1], kind: owned[2] as StagingKind, stale };
}

export interface StagingRecovery {
  /** Packs whose install crashed between moving the old copy aside and placing the new one */
  restored: string[];
  /** Staging dirs removed */
  removed: string[];
  /** Entries that couldn't be handled; they're left in place */
  failed: { name: string; error: string }[];
}

/**
 * Cleans up after installs and publishes a crashed or killed process left in `dir`. A pack whose
 * only copy is its moved-aside previous version (`.<id>.previous-*` with `<id>` missing) is moved
 * back; other stale staging dirs are removed. Staging owned by a running process is another
 * install in progress and stays. Run before discovering packs, so a restored pack is found.
 * Never throws: an entry that can't be handled is reported in `failed`.
 *
 * An orphaned `.previous` is always restored, whatever else the app has recorded. Only `placePack` makes
 * one, and it removes it on success and on a failed rename, so one that survives means an install died
 * part-way. An uninstall cannot have happened since: it needs `<id>` to be there, and the interrupted
 * install moved it aside. Restoring is also the safe direction — deleting a pack's only copy is the bug
 * this function exists to avoid.
 */
export function recoverStagingDirs(dir: string): StagingRecovery {
  const result: StagingRecovery = { restored: [], removed: [], failed: [] };
  let names: string[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') result.failed.push({ name: dir, error: String(err) });
    return result;
  }

  const entries: StagingEntry[] = [];
  for (const name of names) {
    try {
      const entry = parseStagingDir(dir, name);
      if (entry?.stale) entries.push(entry);
    } catch (err) {
      result.failed.push({ name, error: String(err) });
    }
  }

  for (const entry of entries.filter((e) => e.kind === 'previous')) {
    try {
      if (fs.existsSync(path.join(dir, entry.id))) continue;
      fs.renameSync(path.join(dir, entry.name), path.join(dir, entry.id));
      result.restored.push(entry.id);
    } catch (err) {
      result.failed.push({ name: entry.name, error: String(err) });
    }
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (!fs.existsSync(full)) continue;
    try {
      fs.rmSync(full, { recursive: true });
      result.removed.push(entry.name);
    } catch (err) {
      result.failed.push({ name: entry.name, error: String(err) });
    }
  }
  return result;
}

/**
 * Boot-time data dir upkeep, before packs are discovered: records the AgentBuddy version for
 * `abuddy install` and recovers staging in each packs dir. Failures are logged; boot continues.
 */
export function prepareHostDataDirs(
  options: { userDataDir: string; packsDir: string; hostPacksDir?: string; version: string },
  log: Pick<Console, 'info' | 'warn'> = console,
): void {
  try {
    recordHostVersion(options.userDataDir, options.version);
  } catch (err) {
    log.warn(`[packs] Could not record the host version in ${options.userDataDir}: ${err}`);
  }
  for (const dir of [options.packsDir, options.hostPacksDir]) {
    if (!dir) continue;
    const { restored, removed, failed } = recoverStagingDirs(dir);
    for (const id of restored) log.info(`[packs] Restored "${id}", whose install was interrupted`);
    for (const name of removed) log.info(`[packs] Removed stale staging dir ${name}`);
    for (const { name, error } of failed) log.warn(`[packs] Could not clean up ${name}: ${error}`);
  }
}
