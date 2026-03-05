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

import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence, closePersistence, resetLmdbFiles } from '@/core/ears/attribute-storage';
import { createDefaultSettings } from '@/systems/settings/repository';

async function run() {
  console.log('Hydrating LMDB connections...');
  await hydrateSharded({ envs, policy, shardedPersistence: persistence });

  console.log('Resetting database — wiping all LMDB data...');
  await resetLmdbFiles();

  console.log('Recreating default settings...');
  createDefaultSettings();

  // Pre-load central repository to resolve circular dependency
  // (flows repo ↔ central repo — loading central first ensures flows repo
  // is evaluated before central repo accesses flowsQueries)
  // await import('@/repository');
  // const { flowsCommands } = await import('@/systems/flows/repository');

  // console.log('Creating root flow...');
  // const { flow } = flowsCommands.createFlowWithEntryNode({
  //   label: 'Root Flow',
  //   description: 'The root flow of the application',
  // });
  // flowsCommands.grantRootFlowRole(flow.id);

  console.log('Database reset complete.');
  closePersistence();
}

run().catch(err => {
  console.error('Reset failed:', err);
  process.exit(1);
});
