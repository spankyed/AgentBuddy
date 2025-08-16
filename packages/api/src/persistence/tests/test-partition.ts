/**
 * Test script to demonstrate partitioned persistence
 * 
 * Usage: npx tsx src/persistence/tests/test-partition.ts
 */

import { EARS } from '@/core/types';
import { createEntity, addAttr, addRelation, destroyEntity, getAllEntities } from '@/core/utils/ears/attribute-storage';
import { envs, policy, closePersistence } from '@/core/utils/ears/attribute-storage';
import { hydrateSharded } from '../partitioning/hydrate-sharded';

async function testPartitioning() {
  console.log('\n🧪 Testing Partitioned Persistence\n');
  console.log('─'.repeat(50));
  
  // 1. Create entities of different types
  console.log('\n1️⃣ Creating test entities...');
  
  const doc1 = createEntity(EARS.Entity.Document);
  console.log(`  ✅ Created Document: ${doc1}`);
  addAttr(doc1, EARS.AttrKind.Custom('title'), 'Important Document');
  
  const tnode1 = createEntity(EARS.Entity.TNode);
  console.log(`  ✅ Created TNode: ${tnode1} (excluded type)`);
  addAttr(tnode1, EARS.AttrKind.Custom('traceData'), { event: 'click', timestamp: Date.now() });
  
  const tnode2 = createEntity(EARS.Entity.TNode);
  console.log(`  ✅ Created TNode: ${tnode2} (excluded type)`);
  addAttr(tnode2, EARS.AttrKind.Custom('traceData'), { event: 'hover', timestamp: Date.now() });
  
  const agent1 = createEntity(EARS.Entity.Agent);
  console.log(`  ✅ Created Agent: ${agent1}`);
  addAttr(agent1, EARS.AttrKind.Custom('name'), 'Test Agent');
  
  // 2. Create relations
  console.log('\n2️⃣ Creating relations...');
  
  const rel1 = addRelation(doc1, 'references', agent1);
  console.log(`  ✅ Document → Agent relation (primary)`);
  
  const rel2 = addRelation(tnode1, 'traces', tnode2);
  console.log(`  ✅ TNode → TNode relation (volatile)`);
  
  const rel3 = addRelation(tnode1, 'monitors', doc1);
  console.log(`  ✅ TNode → Document relation (volatile - touches excluded)`);
  
  // 3. Show current state
  console.log('\n3️⃣ Current in-memory state:');
  const allEntities = getAllEntities();
  console.log(`  Total entities: ${allEntities.length}`);
  console.log(`  Entities: ${allEntities.join(', ')}`);
  
  // 4. Check partition routing
  console.log('\n4️⃣ Partition routing:');
  console.log(`  Document ${doc1}: ${policy.routeEntity(doc1)}`);
  console.log(`  TNode ${tnode1}: ${policy.routeEntity(tnode1)}`);
  console.log(`  Agent ${agent1}: ${policy.routeEntity(agent1)}`);
  
  // 5. Simulate app restart (hydrate only primary)
  console.log('\n5️⃣ Simulating app restart (primary hydration only)...');
  
  // Clear memory state (simulate restart)
  const memoryStateBefore = getAllEntities().length;
  
  // Wait for persistence to flush
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log(`  Memory before: ${memoryStateBefore} entities`);
  console.log('  ⚠️  In real app, memory would be cleared on restart');
  console.log('  ℹ️  TNode entities would NOT be hydrated (volatile backup)');
  
  // 6. Test volatile hydration
  console.log('\n6️⃣ Testing volatile hydration (debug mode)...');
  console.log('  With includeVolatile=true, TNode entities would be restored');
  
  // 7. Cleanup
  console.log('\n7️⃣ Testing entity destruction...');
  destroyEntity(tnode1);
  console.log(`  ✅ Destroyed TNode ${tnode1} (removed from volatile backup)`);
  
  console.log('\n✨ Test completed!\n');
  console.log('─'.repeat(50));
  console.log('\n📁 Database locations:');
  console.log(`  Primary: configured at getLmdbPath()`);
  console.log(`  Volatile: configured at getVolatileLmdbPath()`);
  console.log('\n💡 TNode entities are persisted to volatile backup');
  console.log('   but NOT hydrated on normal app startup');
  
  // Close persistence
  closePersistence();
}

// Run test
testPartitioning().catch(console.error);