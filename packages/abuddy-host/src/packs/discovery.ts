import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@abuddy/sdk/logger';
import { resolveAppContext } from '@abuddy/sdk/env';
import { packRecord, packRecords, type PackRecord } from './installed.ts';
import type { PackManifest } from '@abuddy/sdk/build';

const logger = createLogger('pack-discovery');

export type { PackManifest };

// ── Pack discovery ─────────────────────────────────────────

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
    } catch {
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


/** A pack and what it declares it depends on (`abuddy.json` `dependencies`), as the apply order reads it */
export interface PackDependents {
  id: string;
  dependencies?: Record<string, string>;
}

/**
 * `packs`, ordered so each one follows the packs in the list it depends on.
 *
 * Only edges between the packs given, so a dependency on a pack that is not in the list is not an edge:
 * either the caller is not acting on it, or it is not installed, which is reported when the pack that
 * declares it is installed. Callers that want every edge honoured pass every pack — `packContentTargets`
 * does, which is how a pack depending on one the app ships applies after it.
 *
 * A cycle has no order that satisfies it, and a pack-authoring mistake must not stop an app booting, so
 * the packs in one are still returned, in an order that is arbitrary but deterministic, and the cycle is
 * logged. Stable otherwise: packs with nothing between them come back as they went in.
 */
export function packContentOrder<T extends PackDependents>(packs: readonly T[]): T[] {
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
    logger.warn(`Packs depend on each other, so no order satisfies them all; applying them anyway: ${cycles.join(', ')}`);
  }
  return ordered;
}
