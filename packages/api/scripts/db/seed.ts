#!/usr/bin/env tsx
/**
 * Standalone CLI script for seeding compiled artifacts into LMDB
 *
 * Usage:
 *   npm run db:seed
 */

import { orchestrateDeclarativeSeed } from '@abuddy/host/packs/runtime';
import { openDatabase, closeDatabase, packs } from './database';

async function run() {
  console.log('Initializing database...');
  await openDatabase();
  for (const hooks of packs.getBootHooks()) hooks.onInit?.();

  console.log('Seeding compiled artifacts...\n');
  packs.runRegisteredBootSeeds(orchestrateDeclarativeSeed);

  closeDatabase();
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
