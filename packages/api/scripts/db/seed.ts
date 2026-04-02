#!/usr/bin/env tsx
/**
 * Standalone CLI script for seeding compiled artifacts into LMDB
 *
 * Usage:
 *   npm run db:seed
 */

import * as path from 'path';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence, closePersistence } from '@/core/ears/attribute-storage';
import { createDefaultSettings } from '@/systems/settings/repository';
import { seedData } from '@/setup/seed/index';

async function run() {
  console.log('Initializing database...');
  await hydrateSharded({ envs, policy, shardedPersistence: persistence });
  createDefaultSettings();

  console.log('Seeding compiled artifacts...\n');
  const result = seedData({
    verbose: true,
    force: true,
    compiledDir: path.resolve(process.cwd(), 'scratchpad/compiled'),
  });

  if (result) {
    console.log('\nSeed summary:');
    console.log(`  Actions  — created: ${result.actions.created}, skipped: ${result.actions.skipped}`);
    console.log(`  Prompts  — created: ${result.prompts.created}, skipped: ${result.prompts.skipped}`);
    console.log(`  Flows    — created: ${result.flows.created}, skipped: ${result.flows.skipped}`);
  }

  closePersistence();
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
