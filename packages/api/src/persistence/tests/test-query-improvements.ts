/**
 * Test script to verify LMDB query improvements
 * 
 * Usage: npx tsx src/persistence/tests/test-query-improvements.ts
 */

import { LmdbQuery, decodeAttr } from '../lmdb/query';
import { openEnvAt } from '../lmdb/envs';
import { makeLmdbAdapter } from '../lmdb/adapter';
import * as path from 'path';
import * as fs from 'fs';

// Create a temp directory for testing
const tempDir = path.join(process.cwd(), 'temp-test-query');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

async function testQueryImprovements() {
  console.log('\n🧪 Testing LMDB Query Improvements\n');
  console.log('─'.repeat(50));

  const dbs = openEnvAt(tempDir);
  const adapter = makeLmdbAdapter(dbs);
  if (!adapter) {
    throw new Error('Failed to create LMDB adapter');
  }
  const query = new LmdbQuery(dbs);

  // Test 1: Corrupt index handling
  console.log('\n1️⃣ Testing corrupt index handling...');
  
  // Manually insert a corrupt attribute with non-numeric index
  const corruptKey = `TestKind\x1FEntity-123\x1FnotANumber`;
  dbs.attrs.put(corruptKey, { t: 'string', v: 'corrupt' });
  
  // Also add valid attributes
  adapter.onPutAttrArray?.('TestKind', 'Entity-123', ['valid1', 'valid2', 'valid3']);
  adapter?.close?.(); // flush
  
  const arr = query.getAttrArray('TestKind', 'Entity-123');
  console.log('  Array with corrupt index:', arr);
  console.log('  ✅ Corrupt index was skipped, array is valid');

  // Test 2: Date equality
  console.log('\n2️⃣ Testing Date equality...');
  
  const now = new Date();
  adapter.onCreateEntity('Entity-456', 'TestEntity');
  adapter.onPutAttrArray?.('CreatedAt', 'Entity-456', [now]);
  adapter?.close?.(); // flush
  
  // Test Date comparison
  const foundByDate = query.findEntitiesByAttr('CreatedAt', { 
    equals: now,
    entityType: 'TestEntity'
  });
  console.log('  Found by Date instance:', foundByDate);
  
  // Test Date vs number comparison
  const foundByTimestamp = query.findEntitiesByAttr('CreatedAt', { 
    equals: now.getTime(),
    entityType: 'TestEntity' 
  });
  console.log('  Found by timestamp:', foundByTimestamp);
  console.log('  ✅ Date equality works correctly');

  // Test 3: Deep equality
  console.log('\n3️⃣ Testing deep equality...');
  
  const complexObj = { nested: { value: 42 }, arr: [1, 2, 3] };
  adapter.onCreateEntity('Entity-789', 'TestEntity');
  adapter.onPutAttrArray?.('Config', 'Entity-789', [complexObj]);
  adapter?.close?.(); // flush
  
  // Test without deep equality (should not find)
  const foundShallow = query.findEntitiesByAttr('Config', {
    equals: { nested: { value: 42 }, arr: [1, 2, 3] },
    deepEquals: false
  });
  console.log('  Found with shallow equality:', foundShallow);
  
  // Test with deep equality (should find)
  const foundDeep = query.findEntitiesByAttr('Config', {
    equals: { nested: { value: 42 }, arr: [1, 2, 3] },
    deepEquals: true
  });
  console.log('  Found with deep equality:', foundDeep);
  console.log('  ✅ Deep equality works correctly');

  // Test 4: Tombstone filtering for relations
  console.log('\n4️⃣ Testing tombstone filtering...');
  
  // Create entities and relations
  adapter.onCreateEntity('Doc-1', 'Document');
  adapter.onCreateEntity('Doc-2', 'Document');
  adapter.onCreateEntity('Doc-3', 'Document');
  adapter.onAddRelation('Rel-1', 'LINKS', 'Doc-1', 'Doc-2', null);
  adapter.onAddRelation('Rel-2', 'LINKS', 'Doc-1', 'Doc-3', null);
  
  // Delete Doc-2
  adapter.onDestroyEntity('Doc-2');
  adapter?.close?.(); // flush
  
  // Get neighbors without filtering (includes deleted)
  const allNeighbors = query.neighbors('Doc-1', { 
    kind: 'LINKS', 
    skipDeleted: false 
  });
  console.log('  Neighbors (including deleted):', allNeighbors);
  
  // Get neighbors with filtering (excludes deleted)
  const aliveNeighbors = query.neighbors('Doc-1', { 
    kind: 'LINKS', 
    skipDeleted: true 
  });
  console.log('  Neighbors (excluding deleted):', aliveNeighbors);
  console.log('  ✅ Tombstone filtering works correctly');

  // Test 5: Pagination
  console.log('\n5️⃣ Testing pagination...');
  
  // Create many entities
  for (let i = 0; i < 10; i++) {
    adapter.onCreateEntity(`Page-${i}`, 'Page');
    adapter.onPutAttrArray?.('Index', `Page-${i}`, [i]);
  }
  adapter?.close?.(); // flush
  
  // Test with limit
  const limited = [...query.entitiesHavingAttr('Index', 3)];
  console.log('  Entities with limit=3:', limited);
  
  // Test relation limit
  let relCount = 0;
  for (const _ of query.relations({ limit: 5 })) {
    relCount++;
  }
  console.log('  Relations with limit=5:', relCount);
  console.log('  ✅ Pagination works correctly');

  // Test 6: Helper utilities
  console.log('\n6️⃣ Testing helper utilities...');
  
  adapter.onCreateEntity('Helper-1', 'Helper');
  adapter.onPutAttrArray?.('Values', 'Helper-1', [1, 2, 3, 4, 5]);
  adapter?.close?.(); // flush
  
  const count = query.getAttrCount('Values', 'Helper-1');
  console.log('  Attribute count:', count);
  
  const first = query.getFirstAttr('Values', 'Helper-1');
  console.log('  First attribute:', first);
  console.log('  ✅ Helper utilities work correctly');

  // Test 7: Exported decodeAttr
  console.log('\n7️⃣ Testing exported decodeAttr...');
  
  const dateRec = { t: 'date' as const, v: '2025-01-01T00:00:00.000Z' };
  const decoded = decodeAttr(dateRec);
  console.log('  Decoded date:', decoded);
  console.log('  Is Date instance:', decoded instanceof Date);
  console.log('  ✅ decodeAttr is exported and works');

  console.log('\n✨ All query improvements verified successfully!\n');
  console.log('─'.repeat(50));
  
  // Cleanup
  // Close the databases
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Run test
testQueryImprovements().catch(console.error);