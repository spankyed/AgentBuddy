#!/usr/bin/env tsx
/**
 * Standalone CLI script for seeding compiled artifacts into LMDB
 *
 * Usage:
 *   npm run db:seed
 */

import '@/setup/sdk-host-init';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence, closePersistence } from '@/core/ears/attribute-storage';
import { loadBuiltInPacks } from '@/core/packs/pack-loader';
import { getBootHooks, runRegisteredBootSeeds } from '@/core/packs/pack-registration';

const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

async function run() {
  await loadBuiltInPacks(packagesDir);

  console.log('Initializing database...');
  await hydrateSharded({ envs, policy, shardedPersistence: persistence });
  for (const hooks of getBootHooks()) hooks.createDefaultSettings?.();

  console.log('Seeding compiled artifacts...\n');
  runRegisteredBootSeeds();

  closePersistence();
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
