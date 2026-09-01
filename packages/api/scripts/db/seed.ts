#!/usr/bin/env tsx
/**
 * Standalone CLI script for seeding compiled artifacts into LMDB
 *
 * Usage:
 *   npm run db:seed
 */

import '@/setup/sdk-host-init';
import * as path from 'path';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence, closePersistence } from '@/core/ears/attribute-storage';
import { loadBuiltInPack } from '@/core/packs/pack-loader';
import { getBootHooks } from '@/core/packs/pack-registration';
import { seedData } from '@/core/shared/seed';

async function run() {
  loadBuiltInPack();

  console.log('Initializing database...');
  await hydrateSharded({ envs, policy, shardedPersistence: persistence });
  for (const hooks of getBootHooks()) hooks.createDefaultSettings?.();

  console.log('Seeding compiled artifacts...\n');
  const result = seedData({
    verbose: true,
    compiledDir: path.resolve(process.cwd(), 'packages/default-setup/dist'),
  });

  console.log('\nSeed summary:');
  for (const [key, counts] of Object.entries(result)) {
    console.log(`  ${key} — created: ${counts.created}, updated: ${counts.updated}, skipped: ${counts.skipped}`);
  }

  closePersistence();
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
