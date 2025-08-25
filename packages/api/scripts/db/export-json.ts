#!/usr/bin/env tsx
/**
 * Script: Export entities as clean JSON with metadata
 * 
 * Usage:
 *   # Export all Settings
 *   npm run db:export Settings > settings.json
 *   
 *   # Export specific entity type
 *   npm run db:export Thread > threads.json
 *   
 *   # Export all entities
 *   npm run db:export > all-data.json
 *   
 *   # Export specific entity by ID
 *   npm run db:export -- --id Settings-123 > entity.json
 *   
 *   # Export without metadata (raw data only)
 *   npm run db:export -- --raw Settings > settings.json
 */

import { qx } from '@/core/ears/helpers/query';
import { EARS } from '@/core/types';
import { getAllEntities, getEntitiesOfType, envs, policy, persistence, closePersistence } from '@/core/ears/attribute-storage';
import { getLmdbPath, getVolatileLmdbPath, getSecretsLmdbPath } from '@/core/utils/paths';
import { hydrateSharded } from '@/persistence/partitioning/hydrate-sharded';
import { createDefaultSettings } from '@/systems/settings/repository';
import * as os from 'node:os';

// Suppress all console output except our final JSON
const originalLog = console.log;
const originalError = console.error;
const originalWrite = process.stdout.write;
const originalErrWrite = process.stderr.write;

// Suppress all output during initialization
console.log = () => {};
console.error = () => {};
process.stdout.write = () => true;
process.stderr.write = () => true;

async function exportJSON() {
  try {
    // Initialize database first (silently)
    await hydrateSharded({ 
      envs, 
      policy, 
      shardedPersistence: persistence 
    });
    
    // Initialize default settings if they don't exist
    createDefaultSettings();

    const args = process.argv.slice(2);
    let data: any;
    let exportType = 'unknown';
    let entityFilter: string | undefined;
    let rawMode = false;

    // Check for --raw flag
    const rawIndex = args.indexOf('--raw');
    if (rawIndex !== -1) {
      rawMode = true;
      args.splice(rawIndex, 1);
    }

    if (args.length === 0) {
      // Export all entities
      const allIds = getAllEntities();
      data = allIds.map(id => qx(id).pickOne()).filter(Boolean);
      exportType = 'all';
    } else if (args[0] === '--id' && args[1]) {
      // Export specific entity by ID
      data = qx(args[1]).pickOne();
      exportType = 'single';
      entityFilter = args[1];
    } else if (args[0] in EARS.Entity) {
      // Export by entity type
      data = qx(EARS.Entity[args[0] as keyof typeof EARS.Entity]).pickAll();
      exportType = 'type';
      entityFilter = args[0];
    } else {
      // Try treating it as an entity type string
      const entityType = args[0] as EARS.Entity;
      data = qx(entityType).pickAll();
      exportType = 'type';
      entityFilter = args[0];
    }

    // If raw mode, output only the data
    if (rawMode) {
      // Restore stdout for final output
      process.stdout.write = originalWrite;
      process.stdout.write(JSON.stringify(data, null, 2));
      return;
    }

    // Prepare metadata
    const metadata = {
      exportMetadata: {
        timestamp: new Date().toISOString(),
        exportType,
        entityFilter,
        recordCount: Array.isArray(data) ? data.length : (data ? 1 : 0),
        database: {
          primaryPath: getLmdbPath(),
          volatilePath: getVolatileLmdbPath(),
          secretsPath: getSecretsLmdbPath()
        },
        environment: {
          hostname: os.hostname(),
          platform: os.platform(),
          nodeVersion: process.version,
          cwd: process.cwd()
        },
        statistics: {} as Record<string, number>
      },
      data
    };

    // Add statistics for full exports
    if (exportType === 'all') {
      for (const entityType of Object.values(EARS.Entity)) {
        const count = getEntitiesOfType(entityType).length;
        if (count > 0) {
          metadata.exportMetadata.statistics[entityType] = count;
        }
      }
      metadata.exportMetadata.statistics.total = getAllEntities().length;
    } else if (exportType === 'type' && entityFilter) {
      // Add type-specific stats
      const allOfType = getEntitiesOfType(entityFilter as EARS.Entity);
      metadata.exportMetadata.statistics[entityFilter] = allOfType.length;
      metadata.exportMetadata.statistics.exported = metadata.exportMetadata.recordCount;
    }

    // Restore stdout and output the JSON with metadata
    process.stdout.write = originalWrite;
    process.stdout.write(JSON.stringify(metadata, null, 2));
    
    // Clean shutdown
    closePersistence();
    process.exit(0);
  } catch (error) {
    // Restore stderr for error reporting
    process.stderr.write = originalErrWrite;
    console.error = originalError;
    console.error('Error:', error);
    closePersistence();
    process.exit(1);
  }
}

// Run the export
exportJSON().catch(() => {
  process.exit(1);
});