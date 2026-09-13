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

import { getBootHooks } from '@abuddy/host/packs';
import { resetLmdbFiles } from '@/core/ears/attribute-storage';
import { openDatabase, closeDatabase } from './database';

async function run() {
  await openDatabase();

  console.log('Resetting database — wiping all LMDB data...');
  await resetLmdbFiles();

  console.log('Creating default data...');
  for (const hooks of getBootHooks()) hooks.onInit?.();

  console.log('Database reset complete.');
  closeDatabase();
}

run().catch(err => {
  console.error('Reset failed:', err);
  process.exit(1);
});
