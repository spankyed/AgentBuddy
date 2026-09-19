import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '@abuddy/sdk/logger';
import { readInstalledPacks, writeInstalledPacks, addInstalledPack } from './installed-packs.ts';
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
 * The external packs a data dir has enabled: everything in `packsDir`, minus the ids `disabled` names.
 *
 * The directory is the list. A pack the record has never heard of is installed and enabled — which is
 * what an `abuddy install` outside the app leaves behind, and what `abuddy dev` leaves when it installs
 * into a running one. The record only ever takes packs away from this list.
 *
 * The caller reads `disabled`, because what an unreadable record means depends on who is asking: the app
 * carries on with everything enabled and says so, while a tool reading someone else's data dir refuses
 * rather than answer differently from the app it is standing in for.
 */
export function enabledExternalPacks(packsDir: string, disabled: ReadonlySet<string>): DiscoveredPack[] {
  return discoverPacks(packsDir).filter(({ manifest }) => !disabled.has(manifest.id));
}

export function reconcileInstalledPacks(
  discovered: { manifest: PackManifest; dir: string }[],
): { manifest: PackManifest; dir: string }[] {
  // With no readable record every pack in packs/ is added back enabled, any the user had disabled included.
  // None of them is newly discovered, so they are reported once, together, rather than as fresh installs.
  const record = readInstalledPacks();
  const rebuilding = !record.found;
  let installed = record.found ? record.packs : [];
  let changed = false;

  const discoveredById = new Map(discovered.map(d => [d.manifest.id, d]));

  for (const { manifest, dir } of discovered) {
    const existing = installed.find(e => e.id === manifest.id);
    if (!existing) {
      installed = addInstalledPack(installed, {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        dir,
        enabled: true,
      });
      changed = true;
      if (!rebuilding) logger.info(`New external pack discovered: ${manifest.id}`);
    } else if (existing.version !== manifest.version || existing.dir !== dir) {
      installed = addInstalledPack(installed, {
        id: existing.id,
        name: manifest.name,
        version: manifest.version,
        dir,
        enabled: existing.enabled,
      });
      changed = true;
    }
  }

  const before = installed.length;
  installed = installed.filter(e => discoveredById.has(e.id));
  if (installed.length !== before) changed = true;

  if (rebuilding && installed.length > 0) {
    const names = installed.map(e => e.id).join(', ');
    logger.warn(`No record of installed packs: rebuilt it from the packs directory, and ${installed.length} pack(s) are enabled (${names}). A pack disabled before this is enabled again.`);
  }
  if (changed) writeInstalledPacks(installed);

  const enabledIds = new Set(installed.filter(e => e.enabled).map(e => e.id));
  return discovered.filter(d => enabledIds.has(d.manifest.id));
}
