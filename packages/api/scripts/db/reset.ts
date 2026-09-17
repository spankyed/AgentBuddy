#!/usr/bin/env tsx
/**
 * Standalone CLI script for resetting the LMDB database
 *
 * Wipes all data and recreates the packs' default data (settings, root flow).
 * Use this when the app is broken and can't start.
 *
 * Usage:
 *   npm run db:reset
 */

import { services } from '@abuddy/sdk/services';
import { openDatabase, closeDatabase } from './database';

async function run() {
  await openDatabase();

  // The app's reset: wipes the stores, then runs each pack's onInit and boot seed, then the migrations
  console.log('Resetting database — wiping all LMDB data and recreating the default data...');
  await services.appData.reset();

  console.log('Database reset complete.');
  closeDatabase();
}

run().catch(err => {
  console.error('Reset failed:', err);
  process.exit(1);
});
