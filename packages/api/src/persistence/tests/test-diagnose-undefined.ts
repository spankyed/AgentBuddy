/**
 * Diagnostic test to understand how "undefined" string values get into LMDB
 * 
 * Usage: npx tsx src/persistence/tests/test-diagnose-undefined.ts
 */

import { EARS } from '@/core/types';
import { createEntity, addRelation, updateRelation, getAttr } from '@/core/ears/attribute-storage';
import { envs, persistence, closePersistence } from '@/core/ears/attribute-storage';

async function diagnoseUndefinedIssue() {
  console.log('\n🔍 Diagnosing "undefined" String in LMDB\n');
  console.log('─'.repeat(50));
  
  // Test 1: Check what happens when we coerce undefined to string
  console.log('\n1️⃣ Testing string coercion scenarios...');
  
  const testValues = [
    { value: undefined, desc: 'undefined' },
    { value: null, desc: 'null' },
    { value: '', desc: 'empty string' },
    { value: 'undefined', desc: 'string "undefined"' },
    { value: String(undefined), desc: 'String(undefined)' },
    { value: `${undefined}`, desc: 'template literal with undefined' },
  ];
  
  for (const test of testValues) {
    console.log(`  ${test.desc}:`);
    console.log(`    Raw value: ${test.value}`);
    console.log(`    typeof: ${typeof test.value}`);
    console.log(`    String(): "${String(test.value)}"`);
    console.log(`    Truthy? ${!!test.value}`);
    console.log(`    === "undefined"? ${test.value === "undefined"}`);
    console.log(`    === undefined? ${test.value === undefined}`);
  }
  
  // Test 2: Check existing relations in LMDB
  console.log('\n2️⃣ Examining existing LMDB data...');
  
  const primary = envs.primary;
  if (primary && primary.relations) {
    let count = 0;
    let suspectCount = 0;
    const suspects: any[] = [];
    
    for (const { key, value } of primary.relations.getRange({ limit: 100 })) {
      count++;
      
      // Check for suspicious values
      if (value.src === 'undefined' || value.tgt === 'undefined' ||
          value.src === 'null' || value.tgt === 'null' ||
          !value.src || !value.tgt) {
        suspectCount++;
        suspects.push({ key: String(key), ...value });
      }
    }
    
    console.log(`  Total relations examined: ${count}`);
    console.log(`  Suspect relations found: ${suspectCount}`);
    
    if (suspects.length > 0) {
      console.log('\n  Suspect relations:');
      for (const s of suspects.slice(0, 5)) {
        console.log(`    ${s.key}:`);
        console.log(`      src: "${s.src}" (type: ${typeof s.src})`);
        console.log(`      tgt: "${s.tgt}" (type: ${typeof s.tgt})`);
        console.log(`      kind: "${s.kind}"`);
      }
    }
  }
  
  // Test 3: Trace how undefined could enter the system
  console.log('\n3️⃣ Testing potential entry points for "undefined" string...');
  
  // Scenario A: Direct string "undefined" passed
  console.log('\n  Scenario A: Direct string "undefined"');
  try {
    const doc1 = createEntity(EARS.Entity.Document);
    const undefinedStr = 'undefined' as any;
    
    // This would create a relation with literal string "undefined"
    console.log('    Attempting to create relation with string "undefined"...');
    // We don't actually do this to avoid polluting the DB
    console.log('    Would result in: src="undefined" (string type)');
  } catch (error: any) {
    console.log(`    Error: ${error.message}`);
  }
  
  // Scenario B: Variable containing undefined gets stringified
  console.log('\n  Scenario B: Undefined variable gets stringified');
  const someVar: any = undefined;
  const stringified = String(someVar);
  console.log(`    undefined variable: ${someVar}`);
  console.log(`    After String(): "${stringified}"`);
  console.log(`    Result === "undefined": ${stringified === "undefined"}`);
  
  // Scenario C: Template literal with undefined
  console.log('\n  Scenario C: Template literal with undefined');
  const id: any = undefined;
  const templated = `Document-${id}`;
  console.log(`    Template: \`Document-\${undefined}\``);
  console.log(`    Result: "${templated}"`);
  
  // Test 4: Check how the relation was likely created
  console.log('\n4️⃣ Analyzing the specific relation ID...');
  const problemRelId = 'Relation-medyvsyj2qjx55inhxd7m';
  
  // Try to find this relation in memory
  const relDetails = getAttr(problemRelId as EARS.EntityId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail | null;
  if (relDetails) {
    console.log(`  Found in memory:`);
    console.log(`    sourceEntity: ${relDetails.sourceEntity}`);
    console.log(`    targetEntity: ${relDetails.targetEntity}`);
    console.log(`    relationType: ${relDetails.relationType}`);
  } else {
    console.log(`  Not found in memory (may have been skipped during hydration)`);
  }
  
  // Check LMDB directly
  if (primary && primary.relations) {
    const dbRel = primary.relations.get(problemRelId);
    if (dbRel) {
      console.log(`  Found in LMDB:`);
      console.log(`    src: "${dbRel.src}" (type: ${typeof dbRel.src})`);
      console.log(`    tgt: "${dbRel.tgt}" (type: ${typeof dbRel.tgt})`);
      console.log(`    kind: "${dbRel.kind}"`);
      console.log(`    createdAt: ${new Date(dbRel.createdAt).toISOString()}`);
      
      // Check if it's the string "undefined"
      if (dbRel.src === 'undefined' || dbRel.tgt === 'undefined') {
        console.log('\n  ⚠️ FOUND THE ISSUE: Literal string "undefined" in database!');
        console.log('  This likely happened when:');
        console.log('  1. A variable containing undefined was converted to string');
        console.log('  2. String interpolation like `${undefined}` was used');
        console.log('  3. String() or toString() was called on undefined');
      }
    } else {
      console.log(`  Not found in LMDB`);
    }
  }
  
  // Test 5: Reproduce the issue
  console.log('\n5️⃣ Attempting to reproduce the issue...');
  
  // This is likely how it happened:
  const doc1 = createEntity(EARS.Entity.Document);
  const doc2 = createEntity(EARS.Entity.Document);
  
  // Someone might have done something like this:
  let entityId: any;  // undefined
  const badId = String(entityId);  // becomes "undefined"
  
  console.log(`  Variable undefined: ${entityId}`);
  console.log(`  After String(): "${badId}"`);
  console.log(`  This would create a relation with src or tgt = "undefined"`);
  
  console.log('\n✨ Diagnosis complete!\n');
  console.log('─'.repeat(50));
  
  console.log('\n📊 Conclusion:');
  console.log('  The issue occurs when undefined JavaScript values are');
  console.log('  converted to the string "undefined" before being stored.');
  console.log('  This can happen through:');
  console.log('  - String(undefined) → "undefined"');
  console.log('  - `${undefined}` → "undefined"');
  console.log('  - undefined + "" → "undefined"');
  console.log('\n  The validation correctly catches this during hydration,');
  console.log('  but we should prevent it from being stored in the first place.');
  
  closePersistence();
}

// Run diagnostic
diagnoseUndefinedIssue().catch(console.error);