import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { recordHostVersion } from './host-info.ts';
import { readInstalledPacksRecord } from './installed-packs.ts';

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

/** When this machine booted: nothing written before it belongs to a running process, whatever its PID says */
const bootTime = () => Date.now() - os.uptime() * 1000;

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to someone else
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

interface StagingEntry { name: string; id: string; kind: StagingKind; stale: boolean }

/**
 * A staging dir and whether the process that made it is gone: its PID isn't running, or the dir predates
 * this boot, which a later process reusing that PID would otherwise hide.
 */
function parseStagingDir(dir: string, name: string, bootedAt: number): StagingEntry | null {
  const owned = OWNED_STAGING_DIR.exec(name);
  if (!owned) return null;
  const pid = Number(owned[3]);
  const fromBeforeBoot = fs.statSync(path.join(dir, name)).mtimeMs < bootedAt;
  const stale = pid !== process.pid && (fromBeforeBoot || !processIsRunning(pid));
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
 * `installedIds` is which packs the registry still lists: a pack uninstalled after the interrupted
 * install isn't restored. Without it (the built-in packs' dir, which has no registry) every pack is.
 */
export function recoverStagingDirs(dir: string, installedIds?: ReadonlySet<string>): StagingRecovery {
  const result: StagingRecovery = { restored: [], removed: [], failed: [] };
  let names: string[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') result.failed.push({ name: dir, error: String(err) });
    return result;
  }

  const entries: StagingEntry[] = [];
  const bootedAt = bootTime();
  for (const name of names) {
    try {
      const entry = parseStagingDir(dir, name, bootedAt);
      if (entry?.stale) entries.push(entry);
    } catch (err) {
      result.failed.push({ name, error: String(err) });
    }
  }

  for (const entry of entries.filter((e) => e.kind === 'previous')) {
    try {
      if (fs.existsSync(path.join(dir, entry.id))) continue;
      // Uninstalled while its interrupted install's copy sat here: it stays gone
      if (installedIds && !installedIds.has(entry.id)) continue;
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
  // No readable record means we can't say a pack was uninstalled, so every interrupted install is restored.
  // `readInstalledPacks` would answer `[]` here, which reads as "nothing is installed" and deletes the
  // interrupted install's only copy — the restore this function exists to perform.
  const record = readInstalledPacksRecord();
  const installedIds: ReadonlySet<string> | undefined = record ? new Set(record.map((entry) => entry.id)) : undefined;
  if (!record) log.warn('[packs] No readable record of installed packs, so every interrupted install is restored');
  // The built-in packs' dir has no registry: its interrupted publishes are always recovered
  for (const [dir, ids] of [[options.packsDir, installedIds], [options.hostPacksDir, undefined]] as const) {
    if (!dir) continue;
    const { restored, removed, failed } = recoverStagingDirs(dir, ids);
    for (const id of restored) log.info(`[packs] Restored "${id}", whose install was interrupted`);
    for (const name of removed) log.info(`[packs] Removed stale staging dir ${name}`);
    for (const { name, error } of failed) log.warn(`[packs] Could not clean up ${name}: ${error}`);
  }
}
