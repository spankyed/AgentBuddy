#!/usr/bin/env tsx
/**
 * Standalone CLI script for seeding compiled artifacts into LMDB
 *
 * Usage:
 *   npm run db:seed
 */

import { getBootHooks, runRegisteredBootSeeds } from '@abuddy/host/packs';
import { orchestrateDeclarativeSeed } from '@/packs/pack-seed';
import { openDatabase, closeDatabase } from './database';

async function run() {
  console.log('Initializing database...');
  await openDatabase();
  for (const hooks of getBootHooks()) hooks.onInit?.();

  console.log('Seeding compiled artifacts...\n');
  runRegisteredBootSeeds(orchestrateDeclarativeSeed);

  closeDatabase();
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
