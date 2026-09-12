/**
 * Pack Registry
 *
 * Persistent JSON-file registry of installed external packs.
 * Tracks install state and enabled/disabled status.
 * Built-in packs don't use this — they load directly from discovery.
 *
 * Lives outside LMDB because packs must register before EARS hydration.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '../logger';

const logger = createLogger('pack-registry');

export interface PackRegistryEntry {
  id: string;
  name: string;
  version: string;
  dir: string;
  enabled: boolean;
  registeredAt: string;
  source?: string;
  availableVersion?: string;
  lastUpdateCheck?: string;
}

interface PackRegistryFile {
  packs: PackRegistryEntry[];
}

function getRegistryPath(): string {
  const userDataPath = process.env.USER_DATA_PATH || path.join(os.homedir(), '.agentbuddy');
  return path.join(userDataPath, 'pack-registry.json');
}

export function readPackRegistry(): PackRegistryEntry[] {
  const registryPath = getRegistryPath();
  if (!fs.existsSync(registryPath)) return [];

  try {
    const data: PackRegistryFile = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    return (data.packs ?? []).map(e => ({
      ...e,
      enabled: e.enabled ?? true,
    }));
  } catch (err) {
    logger.warn('Failed to read pack registry, starting fresh:', err as Error);
    return [];
  }
}

export function writePackRegistry(entries: PackRegistryEntry[]): void {
  const registryPath = getRegistryPath();
  const dir = path.dirname(registryPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const data: PackRegistryFile = { packs: entries };
  const tmpPath = registryPath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, registryPath);
  } catch (err) {
    logger.error('Failed to write pack registry:', err as Error);
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

export function addToRegistry(entries: PackRegistryEntry[], pack: Omit<PackRegistryEntry, 'registeredAt'>): PackRegistryEntry[] {
  const idx = entries.findIndex(e => e.id === pack.id);
  if (idx >= 0) {
    const entry: PackRegistryEntry = { ...pack, registeredAt: entries[idx].registeredAt };
    return [...entries.slice(0, idx), entry, ...entries.slice(idx + 1)];
  }
  const entry: PackRegistryEntry = { ...pack, registeredAt: new Date().toISOString() };
  return [...entries, entry];
}

export function removeFromRegistry(entries: PackRegistryEntry[], id: string): PackRegistryEntry[] {
  return entries.filter(e => e.id !== id);
}

export function modifyRegistry(mutate: (entries: PackRegistryEntry[]) => PackRegistryEntry[]): PackRegistryEntry[] {
  const entries = readPackRegistry();
  const updated = mutate(entries);
  writePackRegistry(updated);
  return updated;
}
