/**
 * Pack Registry
 *
 * Persistent JSON-file registry of installed packs. Read on every boot
 * so packs load directly from recorded entry paths — no discovery needed.
 * The pack loader writes to this registry when packs are first installed.
 *
 * Lives outside LMDB because packs must register before EARS hydration.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '@/core/shared/debug/logger';

const logger = createLogger('pack-registry');

export interface PackRegistryEntry {
  id: string;
  name: string;
  version: string;
  dir: string;
  entry: string;
  type: 'built-in' | 'external';
  registeredAt: string;
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
    return data.packs ?? [];
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
  const entry: PackRegistryEntry = { ...pack, registeredAt: new Date().toISOString() };
  const idx = entries.findIndex(e => e.id === pack.id);
  if (idx >= 0) {
    return [...entries.slice(0, idx), entry, ...entries.slice(idx + 1)];
  }
  return [...entries, entry];
}

export function removeFromRegistry(entries: PackRegistryEntry[], id: string): PackRegistryEntry[] {
  return entries.filter(e => e.id !== id);
}

