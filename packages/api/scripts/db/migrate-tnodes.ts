/**
 * Migration script to move TNode entities from primary to volatile backup
 * and clean up the primary database.
 * 
 * Usage: npx tsx src/persistence/utils/migrate-tnodes.ts
 */

import { open, type Database } from 'lmdb';
import { getLmdbPath, getVolatileLmdbPath } from '@/core/helpers/paths';
import { EARS } from '@/core/types';

const SEPARATOR = '\x1F';

function entTypeOf(id: string): string {
  return id.split('-')[0] ?? id;
}

async function migrateTNodes() {
  console.log('\n🔄 TNode Migration Script\n');
  console.log('─'.repeat(50));
  
  // Open both databases
  const primaryPath = getLmdbPath();
  const volatilePath = getVolatileLmdbPath();
  
  console.log('📁 Database paths:');
  console.log(`  Primary: ${primaryPath}`);
  console.log(`  Volatile: ${volatilePath}`);
  console.log();
  
  // Open primary database
  const primaryRoot = open({
    path: primaryPath,
    maxDbs: 8,
    compression: true,
  });
  
  const primaryEntities = primaryRoot.openDB({ name: 'entities', encoding: 'json' });
  const primaryAttrs = primaryRoot.openDB({ name: 'attrs', encoding: 'json' });
  const primaryRelations = primaryRoot.openDB({ name: 'relations', encoding: 'json' });
  
  // Open volatile backup database
  const volatileRoot = open({
    path: volatilePath,
    maxDbs: 8,
    compression: true,
  });
  
  const volatileEntities = volatileRoot.openDB({ name: 'entities', encoding: 'json' });
  const volatileAttrs = volatileRoot.openDB({ name: 'attrs', encoding: 'json' });
  const volatileRelations = volatileRoot.openDB({ name: 'relations', encoding: 'json' });
  
  // Track statistics
  let stats = {
    tnodeEntities: 0,
    tnodeAttrs: 0,
    tnodeRelations: 0,
    totalScanned: 0,
    migrated: 0,
    deleted: 0,
  };
  
  console.log('🔍 Scanning primary database for TNodes...\n');
  
  // Find all TNode entities
  const tnodeIds = new Set<string>();
  for (const { key, value } of primaryEntities.getRange()) {
    stats.totalScanned++;
    const id = String(key);
    if (entTypeOf(id) === EARS.Entity.TNode) {
      tnodeIds.add(id);
      stats.tnodeEntities++;
    }
  }
  
  if (tnodeIds.size === 0) {
    console.log('✅ No TNode entities found in primary database.');
    console.log('   Database is already clean!\n');
    
    // Close databases
    primaryEntities.close();
    primaryAttrs.close();
    primaryRelations.close();
    primaryRoot.close();
    
    volatileEntities.close();
    volatileAttrs.close();
    volatileRelations.close();
    volatileRoot.close();
    
    return;
  }
  
  console.log(`⚠️  Found ${tnodeIds.size} TNode entities to migrate\n`);
  
  // Start transaction for migration
  console.log('🚀 Starting migration...\n');
  
  await primaryRoot.transactionAsync(async () => {
    await volatileRoot.transactionAsync(async () => {
      
      // 1. Migrate TNode entities
      for (const tnodeId of tnodeIds) {
        const entityData = await primaryEntities.get(tnodeId);
        if (entityData) {
          await volatileEntities.put(tnodeId, entityData);
          await primaryEntities.remove(tnodeId);
          stats.migrated++;
        }
      }
      
      // 2. Migrate attributes for TNodes
      for (const { key, value } of primaryAttrs.getRange()) {
        const keyStr = String(key);
        const [kind, entityId] = keyStr.split(SEPARATOR);
        
        if (tnodeIds.has(entityId)) {
          await volatileAttrs.put(key, value);
          await primaryAttrs.remove(key);
          stats.tnodeAttrs++;
        }
      }
      
      // 3. Migrate relations involving TNodes
      const relationsToMigrate: Array<{ key: string; value: any }> = [];
      
      for (const { key, value } of primaryRelations.getRange()) {
        const relation = value;
        
        // Check if relation involves any TNode
        if (tnodeIds.has(relation.src) || tnodeIds.has(relation.tgt) || tnodeIds.has(String(key))) {
          relationsToMigrate.push({ key: String(key), value });
          stats.tnodeRelations++;
        }
      }
      
      // Migrate the relations
      for (const { key, value } of relationsToMigrate) {
        await volatileRelations.put(key, value);
        await primaryRelations.remove(key);
      }
      
      stats.deleted = stats.migrated + stats.tnodeAttrs + stats.tnodeRelations;
    });
  });
  
  console.log('✅ Migration completed successfully!\n');
  console.log('📊 Migration Statistics:');
  console.log('─'.repeat(30));
  console.log(`  Entities scanned: ${stats.totalScanned}`);
  console.log(`  TNodes found: ${stats.tnodeEntities}`);
  console.log(`  TNodes migrated: ${stats.migrated}`);
  console.log(`  Attributes migrated: ${stats.tnodeAttrs}`);
  console.log(`  Relations migrated: ${stats.tnodeRelations}`);
  console.log(`  Total items moved: ${stats.deleted}`);
  console.log('─'.repeat(30));
  
  // Close databases
  primaryEntities.close();
  primaryAttrs.close();
  primaryRelations.close();
  primaryRoot.close();
  
  volatileEntities.close();
  volatileAttrs.close();
  volatileRelations.close();
  volatileRoot.close();
  
  console.log('\n🎉 Primary database is now clean of TNode entities!');
  console.log('   TNodes have been moved to volatile backup.\n');
}

// Run migration
migrateTNodes().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});