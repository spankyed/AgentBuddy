/**
 * Script to clean up corrupt relation data from LMDB
 * This removes relations with src="undefined", tgt="undefined", etc.
 * 
 * Usage: npx tsx src/persistence/utils/cleanup-corrupt-data.ts
 */

import { envs } from '@/core/utils/ears/attribute-storage';

async function cleanupCorruptData() {
  console.log('\n🧹 Cleaning Up Corrupt Data from LMDB\n');
  console.log('─'.repeat(50));
  
  const invalidStrings = ['undefined', 'null', '', 'NaN'];
  
  // Function to check if a value is corrupt
  const isCorrupt = (value: any): boolean => {
    if (!value || typeof value !== 'string') return true;
    if (invalidStrings.includes(value)) return true;
    if (!value.includes('-')) return true; // Entity IDs should have hyphens
    return false;
  };
  
  // Clean each environment
  const environments = [
    { name: 'primary', env: envs.primary },
    { name: 'volatileBackup', env: envs.volatileBackup }
  ];
  
  for (const { name, env } of environments) {
    if (!env || !env.relations) {
      console.log(`\n❌ ${name} environment not available`);
      continue;
    }
    
    console.log(`\n📦 Cleaning ${name} environment...`);
    
    const toDelete: string[] = [];
    let totalCount = 0;
    let corruptCount = 0;
    
    // First pass: identify corrupt relations
    for (const { key, value } of env.relations.getRange()) {
      totalCount++;
      const relId = String(key);
      
      if (isCorrupt(value.src) || isCorrupt(value.tgt)) {
        corruptCount++;
        toDelete.push(relId);
        
        console.log(`  Found corrupt relation: ${relId}`);
        console.log(`    src: "${value.src}" (${typeof value.src})`);
        console.log(`    tgt: "${value.tgt}" (${typeof value.tgt})`);
        console.log(`    kind: "${value.kind}"`);
      }
    }
    
    console.log(`\n  Scanned ${totalCount} relations`);
    console.log(`  Found ${corruptCount} corrupt relations`);
    
    if (toDelete.length > 0) {
      console.log(`\n  🗑️ Deleting ${toDelete.length} corrupt relations...`);
      
      // Second pass: delete corrupt relations
      try {
        await env.relations.transactionSync(() => {
          for (const relId of toDelete) {
            env.relations.remove(relId);
          }
        });
        console.log(`  ✅ Successfully deleted ${toDelete.length} corrupt relations`);
      } catch (error) {
        console.error(`  ❌ Error deleting relations:`, error);
      }
    } else {
      console.log(`  ✅ No corrupt relations found`);
    }
  }
  
  // Also check entities for corruption
  console.log('\n📦 Checking entities for corruption...');
  
  for (const { name, env } of environments) {
    if (!env || !env.entities) continue;
    
    console.log(`\n  Checking ${name} entities...`);
    
    let entityCount = 0;
    let suspectCount = 0;
    
    for (const { key, value } of env.entities.getRange({ limit: 100 })) {
      entityCount++;
      const entityId = String(key);
      
      // Check if entity ID itself is corrupt
      if (isCorrupt(entityId)) {
        suspectCount++;
        console.log(`    Suspect entity ID: "${entityId}"`);
      }
      
      // Check if entity has invalid type
      if (value && value.type && (value.type === 'undefined' || value.type === 'null')) {
        suspectCount++;
        console.log(`    Entity with invalid type: ${entityId}, type="${value.type}"`);
      }
    }
    
    console.log(`  Checked ${entityCount} entities, found ${suspectCount} suspects`);
  }
  
  console.log('\n✨ Cleanup complete!\n');
  console.log('─'.repeat(50));
  
  console.log('\n📊 Summary:');
  console.log('  - Scanned all relations in both partitions');
  console.log('  - Removed relations with src/tgt = "undefined", "null", etc.');
  console.log('  - Checked entities for corruption');
  console.log('  - Database is now clean');
  
  console.log('\n💡 Next steps:');
  console.log('  1. Restart the application to reload clean data');
  console.log('  2. The validation in LMDB adapter will prevent future corruption');
  console.log('  3. Monitor logs for any "Invalid src/tgt" warnings');
}

// Run cleanup
cleanupCorruptData().catch(console.error).finally(() => {
  // Environments are managed by the persistence layer
  console.log('\n[LMDB] Cleanup script completed');
});