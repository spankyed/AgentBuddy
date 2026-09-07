#!/usr/bin/env tsx
/**
 * Standalone CLI script for resetting the LMDB database
 *
 * Wipes all data and recreates a root flow with default settings.
 * Use this when the app is broken and can't start.
 *
 * Usage:
 *   npm run db:reset
 */

import '@/setup/sdk-host-init';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence, closePersistence, resetLmdbFiles } from '@/core/ears/attribute-storage';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadBuiltInPacksFromDir } from '@/core/packs/pack-loader';
import { getBootHooks } from '@/core/packs/pack-registration';

const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

async function run() {
  await loadBuiltInPacksFromDir(packagesDir);

  console.log('Hydrating LMDB connections...');
  await hydrateSharded({ envs, policy, shardedPersistence: persistence });

  console.log('Resetting database — wiping all LMDB data...');
  await resetLmdbFiles();

  console.log('Recreating default settings...');
  for (const hooks of getBootHooks()) hooks.createDefaultSettings?.();

  console.log('Database reset complete.');
  closePersistence();
}

run().catch(err => {
  console.error('Reset failed:', err);
  process.exit(1);
});
