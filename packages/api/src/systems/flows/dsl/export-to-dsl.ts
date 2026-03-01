#!/usr/bin/env node
/**
 * Export EARS Flows to DSL (Track-Based Format) — CLI Entry Point
 *
 * Extracts all flows and nodes from the EARS database and converts them
 * to the track-based DSL format.
 *
 * Usage: npm run dsl:export
 */

import * as path from 'node:path';
import { hydrateSharded } from '@/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence, closePersistence } from '@/core/ears/attribute-storage';
import { exportFlowsDSL } from './export-dsl';

// Use process.cwd() relative path since this runs from api package
const DSL_DIR = path.resolve(process.cwd(), 'src/systems/flows/dsl');

async function exportAllFlows() {
  console.log('🔄 Initializing database...');

  await hydrateSharded({
    envs,
    policy,
    shardedPersistence: persistence
  });

  console.log('✅ Database initialized\n');

  const outputDir = path.join(DSL_DIR, 'examples');
  const { filePath, flowCount } = exportFlowsDSL(outputDir);

  console.log(`\n✅ Exported ${flowCount} flows to ${filePath}`);

  closePersistence();
}

// Run
exportAllFlows().catch(error => {
  console.error('Export failed:', error);
  process.exit(1);
});
