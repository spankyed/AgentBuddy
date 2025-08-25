#!/usr/bin/env tsx
/**
 * Example script: Clean up settings entities
 * 
 * Usage:
 *   npm run db:script scripts/db/cleanup-settings.ts
 */

import { qx } from '@/core/utils/ears/helpers/query';
import { tx } from '@/core/utils/ears/helpers/transaction';
import { EARS } from '@/core/types';

async function cleanupSettings() {
  console.log('🧹 Starting settings cleanup...\n');

  // Get all settings
  const settings = qx(EARS.Entity.Settings).pickAll();
  console.log(`Found ${settings.length} settings entities\n`);

  if (settings.length === 0) {
    console.log('No settings to clean up');
    return;
  }

  // Group by key to find duplicates
  const byKey = new Map<string, typeof settings>();
  
  settings.forEach(setting => {
    const key = setting.key || setting.name || 'unknown';
    if (!byKey.has(key)) {
      byKey.set(key, []);
    }
    byKey.get(key)!.push(setting);
  });

  // Find and report duplicates
  let duplicatesFound = 0;
  const toDelete: string[] = [];

  console.log('Checking for duplicates:');
  byKey.forEach((items, key) => {
    if (items.length > 1) {
      console.log(`  ⚠️  Found ${items.length} entries for key "${key}"`);
      duplicatesFound += items.length - 1;
      
      // Keep the most recent one (assuming updatedAt or createdAt exists)
      const sorted = items.sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt || 0;
        const bTime = b.updatedAt || b.createdAt || 0;
        return bTime - aTime;
      });
      
      // Mark older ones for deletion
      sorted.slice(1).forEach(item => {
        toDelete.push(item.id);
        console.log(`     - Will delete: ${item.id}`);
      });
    }
  });

  if (duplicatesFound === 0) {
    console.log('✅ No duplicates found');
    return;
  }

  console.log(`\n📊 Summary:`);
  console.log(`  - Total settings: ${settings.length}`);
  console.log(`  - Duplicates to remove: ${toDelete.length}`);
  console.log(`  - Settings after cleanup: ${settings.length - toDelete.length}\n`);

  // Ask for confirmation (in real script, you might want to add a --force flag)
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise<string>(resolve => {
    readline.question('Proceed with cleanup? (y/N): ', resolve);
  });
  readline.close();

  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log('❌ Cleanup cancelled');
    return;
  }

  // Perform cleanup
  console.log('\n🗑️  Deleting duplicate settings...');
  let deleted = 0;
  
  for (const id of toDelete) {
    try {
      tx(id).destroy();
      deleted++;
      process.stdout.write(`\r  Deleted ${deleted}/${toDelete.length}`);
    } catch (error) {
      console.error(`\n  ❌ Failed to delete ${id}:`, error);
    }
  }

  console.log(`\n\n✅ Cleanup complete! Removed ${deleted} duplicate settings.`);
}

// Run the cleanup
cleanupSettings().catch(error => {
  console.error('❌ Error during cleanup:', error);
  process.exit(1);
});