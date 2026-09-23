import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '@abuddy/sdk/logger';
import { resolveAppContext } from '@abuddy/sdk/env';
import { packRecord, packRecords, type PackRecord } from './installed.ts';
import type { PackManifest } from '@abuddy/sdk/build';

const logger = createLogger('pack-discovery');

export type { PackManifest };

// ── Built-in pack discovery ─────────────────────────────────────────

export interface BuiltInPackInfo {
  id: string;
  name: string;
  version: string;
  dir: string;
}

export function discoverBuiltInPacks(packagesDir: string): BuiltInPackInfo[] {
  if (!fs.existsSync(packagesDir)) return [];

  const results: BuiltInPackInfo[] = [];
  const entries = fs.readdirSync(packagesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(packagesDir, entry.name);
    const manifestPath = path.join(dir, 'abuddy.json');
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!manifest.builtIn || !manifest.id || !manifest.name) continue;

      // No source check: packaged apps ship only abuddy.json and dist/. The code comes from the
      // API bundle's loaders (loadBuiltInPacks' bundledLoaders), and loadBuiltInPacks skips packs without one.
      results.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version ?? '0.0.0',
        dir,
      });
    } catch {}
  }

  return results;
}

// ── External pack discovery ─────────────────────────────────────────

export function discoverPacks(packsDir: string): { manifest: PackManifest; dir: string }[] {
  if (!fs.existsSync(packsDir)) return [];

  const results: { manifest: PackManifest; dir: string }[] = [];
  const entries = fs.readdirSync(packsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Hidden dirs are in-progress installs/replacements (see pack-installer placePack)
    if (entry.name.startsWith('.')) continue;
    const packDir = path.join(packsDir, entry.name);
    const manifestPath = path.join(packDir, 'abuddy.json');

    if (!fs.existsSync(manifestPath)) {
      logger.warn(`Skipping ${entry.name}: no abuddy.json`);
      continue;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!raw.id || !raw.name || !raw.version) {
        logger.warn(`Skipping ${entry.name}: manifest missing id, name, or version`);
        continue;
      }
      results.push({ manifest: raw as PackManifest, dir: packDir });
    } catch (err) {
      logger.warn(`Skipping ${entry.name}: failed to parse abuddy.json`);
    }
  }

  return results;
}

/** A pack found in a packs directory, with the manifest read from it */
export interface DiscoveredPack {
  manifest: PackManifest;
  dir: string;
}

/**
 * The external packs a data dir has enabled: everything `discovered` in its packs directory, minus the
 * ids `disabled` names.
 *
 * The directory is the list. A pack the record has never heard of is installed and enabled — which is
 * what an `abuddy install` outside the app leaves behind, and what `abuddy dev` leaves when it installs
 * into a running one. The record only ever takes packs away from this list.
 *
 * The caller reads `disabled`, because what an unreadable record means depends on who is asking: the app
 * carries on with everything enabled and says so, while a tool reading someone else's data dir refuses
 * rather than answer differently from the app it is standing in for.
 */
export function enabledExternalPacks(discovered: DiscoveredPack[], disabled: ReadonlySet<string>): DiscoveredPack[] {
  return discovered.filter(({ manifest }) => !disabled.has(manifest.id));
}

/** A pack the app has: what its directory says, with what the app has recorded about it. */
export interface InstalledPack extends DiscoveredPack {
  record: PackRecord;
}

/**
 * Every pack in the packs directory, enabled or not, with what the app has recorded about it.
 *
 * What the Packs view lists and what an install, update or toggle acts on. A pack with no row is here
 * like any other: the directory is what makes it installed.
 */
export function installedPacks(packsDir = resolveAppContext().packsDir): InstalledPack[] {
  const records = packRecords();
  return discoverPacks(packsDir).map(pack => ({ ...pack, record: packRecord(pack.manifest.id, records) }));
}

/** The ids of the packs in `discovered`, for `forgetPacksExcept`. */
export function discoveredPackIds(discovered: DiscoveredPack[]): ReadonlySet<string> {
  return new Set(discovered.map(({ manifest }) => manifest.id));
}


/** A pack and what it declares it depends on (`abuddy.json` `dependencies`), as the seed order reads it */
export interface PackDependents {
  id: string;
  dependencies?: Record<string, string>;
}

/**
 * `packs`, ordered so each one follows the packs in the list it depends on.
 *
 * Only edges between the packs given. A dependency on a built-in pack is already satisfied — the built-in
 * packs' boot seeds run before any external pack's — and one that isn't installed is reported when the
 * pack is installed, so neither is an edge here.
 *
 * A cycle has no order that satisfies it, and a pack-authoring mistake must not stop an app booting, so
 * the packs in one are still returned, in an order that is arbitrary but deterministic, and the cycle is
 * logged. Stable otherwise: packs with nothing between them come back as they went in.
 */
export function packSeedOrder<T extends PackDependents>(packs: readonly T[]): T[] {
  const byId = new Map(packs.map((pack) => [pack.id, pack]));
  const state = new Map<string, 'visiting' | 'done'>();
  const ordered: T[] = [];
  const cycles: string[] = [];

  function visit(pack: T, trail: readonly string[]): void {
    const seen = state.get(pack.id);
    if (seen === 'done') return;
    if (seen === 'visiting') {
      cycles.push([...trail.slice(trail.indexOf(pack.id)), pack.id].join(' -> '));
      return;
    }
    state.set(pack.id, 'visiting');
    for (const depId of Object.keys(pack.dependencies ?? {})) {
      const dep = byId.get(depId);
      if (dep) visit(dep, [...trail, pack.id]);
    }
    state.set(pack.id, 'done');
    ordered.push(pack);
  }

  for (const pack of packs) visit(pack, []);
  if (cycles.length > 0) {
    logger.warn(`Packs depend on each other, so no order satisfies them all; seeding them anyway: ${cycles.join(', ')}`);
  }
  return ordered;
}
