/**
 * Runtime test for the EARS engine after moving it to the SDK.
 * Tests the engine in isolation without booting the full Electron app.
 */
import { initEARSRuntime, setPersistence } from './src/ears/runtime';
import type { PersistenceSink } from './src/ears/runtime';
import {
  createEntity, clearMemory,
  putAttr, addAttr, mergeAttr, dropAttr, getAttr, getAttrs, getAll,
  grantRole, revokeRole, getRoles,
  addRelation, removeRelation,
  getAllEntities, getEntitiesOfType, getAllEntityTypes,
  getAllRelationKinds, destroyEntity,
  queryEntitiesByAttribute, queryEntitiesByRelationTo, queryEntitiesInRelationTo,
} from './src/ears/attribute-storage';
import { qx } from './src/ears/query';
import { tx } from './src/ears/transaction';
import { edgeStore } from './src/ears/edge-store';
import { bp, spawn } from './src/ears/blueprint';
import { descendants, ancestors, rootParent, wouldCreateCycle, linkSymmetric } from './src/ears/graph';
import { relationIndex } from './src/ears/relation-index';
import { EARS } from './src/types/entities';

let passed = 0;
let failed = 0;
function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

const persistenceCalls: string[] = [];
const testSink: PersistenceSink = {
  onCreateEntity() {},
  onDestroyEntity(id) { persistenceCalls.push(`destroy:${id}`); },
  onPutAttr() { persistenceCalls.push('putAttr'); },
  onPutAttrArray() { persistenceCalls.push('putAttrArray'); },
  onDropAttr() { persistenceCalls.push('dropAttr'); },
  onAddRelation() { persistenceCalls.push('addRelation'); },
  onUpdateRelation() { persistenceCalls.push('updateRelation'); },
  onRemoveRelation() { persistenceCalls.push('removeRelation'); },
};

const entityTypes = new Set(['Thread', 'Message', 'Action', 'Relation', 'Flow', 'Node']);
initEARSRuntime({
  isEntityType: (v: string) => entityTypes.has(v),
  persistence: testSink,
});

console.log('\n=== EARS Engine Runtime Tests ===\n');

console.log('1. createEntity');
const id1 = createEntity('Thread' as EARS.Entity);
assert(id1.startsWith('Thread-'), `creates ID with entity prefix: ${id1}`);
const id2 = createEntity('Message' as EARS.Entity);
assert(id2.startsWith('Message-'), `creates Message ID: ${id2}`);
assert(id1 !== id2, 'unique IDs');

console.log('2. putAttr / getAttr');
putAttr(id1, EARS.AttrKind.Custom('label'), 'Hello');
assert(getAttr(id1, EARS.AttrKind.Custom('label')) === 'Hello', 'put and get attribute');
putAttr(id1, EARS.AttrKind.Custom('label'), 'Updated');
assert(getAttr(id1, EARS.AttrKind.Custom('label')) === 'Updated', 'put replaces value');

console.log('3. addAttr / getAttrs');
addAttr(id1, EARS.AttrKind.Custom('tags'), 'a');
addAttr(id1, EARS.AttrKind.Custom('tags'), 'b');
const tags = getAttrs(id1, EARS.AttrKind.Custom('tags'));
assert(tags.length === 2, `addAttr appends: got ${tags.length} tags`);

console.log('4. mergeAttr');
putAttr(id1, EARS.AttrKind.Custom('meta'), { x: 1 });
mergeAttr(id1, EARS.AttrKind.Custom('meta'), { y: 2 });
const meta = getAttr(id1, EARS.AttrKind.Custom('meta')) as any;
assert(meta.x === 1 && meta.y === 2, 'merge combines objects');

console.log('5. dropAttr');
putAttr(id1, EARS.AttrKind.Custom('temp'), 'gone');
assert(getAttr(id1, EARS.AttrKind.Custom('temp')) === 'gone', 'attr exists before drop');
dropAttr(id1, EARS.AttrKind.Custom('temp'));
assert(getAttr(id1, EARS.AttrKind.Custom('temp')) === null, 'attr null after drop');

console.log('6. roles');
grantRole(id1, 'active');
grantRole(id1, 'primary');
assert(getRoles(id1).includes('active'), 'grantRole works');
revokeRole(id1, 'active');
assert(!getRoles(id1).includes('active'), 'revokeRole works');
assert(getRoles(id1).includes('primary'), 'other role preserved');

console.log('7. relations');
const relId = addRelation(id1, 'parent_of', id2);
assert(relId !== undefined && relId !== null, `addRelation returns ID: ${relId}`);
assert(getAllRelationKinds().includes('parent_of'), 'relation kind indexed');
const related = queryEntitiesByRelationTo('parent_of', id1, true);
assert(related.includes(id2), 'queryEntitiesByRelationTo finds target');
const inRelation = queryEntitiesInRelationTo(id1);
assert(inRelation.includes(id2), 'queryEntitiesInRelationTo finds related');

console.log('8. entity index');
const types = getAllEntityTypes();
assert(types.includes('Thread' as EARS.Entity), 'getAllEntityTypes has Thread');
const threads = getEntitiesOfType('Thread' as EARS.Entity);
assert(threads.includes(id1), 'getEntitiesOfType finds thread');

console.log('9. getAll');
const allAttrs = getAll(id1);
assert('label' in allAttrs, 'getAll returns attributes');

console.log('10. qx fluent query');
const qxIds = qx('Thread' as any).ids();
assert(qxIds.includes(id1), 'qx(Entity).ids() finds entity');
const qxCount = qx('Thread' as any).count();
assert(qxCount >= 1, `qx count: ${qxCount}`);
const picked = qx([id1]).pick(['label'] as const);
assert(picked.length === 1 && (picked[0] as any).label === 'Updated', 'qx pick works');
const firstId = qx('Thread' as any).first();
assert(firstId !== null, 'qx first() returns something');

console.log('11. tx fluent transaction');
const txBuilder = tx('Message' as EARS.Entity);
const txId = txBuilder.put('content', 'Hello world').put('role', 'user').id();
assert(txId.startsWith('Message-'), `tx creates entity: ${txId}`);
assert(getAttr(txId, EARS.AttrKind.Custom('content')) === 'Hello world', 'tx put sets attr');
assert(getAttr(txId, EARS.AttrKind.Custom('role')) === 'user', 'tx chaining works');

console.log('12. tx batchPut');
const batchId = tx('Action' as EARS.Entity).batchPut({ name: 'test', status: 'active' }).id();
assert(getAttr(batchId, EARS.AttrKind.Custom('name')) === 'test', 'batchPut sets attrs');

console.log('13. tx link/unlink');
tx(txId).link('belongs_to' as any, id1);
const linked = qx([txId]).linksTo('belongs_to' as any).ids();
assert(linked.includes(id1), 'tx link creates relation');

console.log('14. edgeStore');
const edges = edgeStore.find({ sourceEntity: txId, relationType: 'belongs_to' });
assert(edges.length > 0, 'edgeStore.find works');
edgeStore.unlink({ sourceEntity: txId, relationType: 'belongs_to' });
const edgesAfter = edgeStore.find({ sourceEntity: txId, relationType: 'belongs_to' });
assert(edgesAfter.length === 0, 'edgeStore.unlink works');

console.log('15. blueprint bp/spawn');
const blueprint = bp('Thread' as EARS.Entity)
  .attr('label', 'Blueprint Thread')
  .grant('test-role' as any)
  .build();
assert(blueprint.entity === 'Thread', 'bp builds blueprint');
const spawnedId = spawn(blueprint);
assert(spawnedId.startsWith('Thread-'), `spawn creates entity: ${spawnedId}`);
assert(getAttr(spawnedId, EARS.AttrKind.Custom('label')) === 'Blueprint Thread', 'spawned entity has attrs');
assert(getRoles(spawnedId).includes('test-role'), 'spawned entity has roles');

console.log('16. graph helpers');
const parent = tx('Flow' as EARS.Entity).put('label', 'Parent Flow').id();
const child = tx('Node' as EARS.Entity).put('label', 'Child Node').id();
addRelation(parent, 'contains', child);
const desc = descendants(parent, 'contains' as any);
assert(desc.includes(child), 'descendants finds child');
const anc = ancestors(child, 'contains' as any);
assert(anc.includes(parent), 'ancestors finds parent');
const root = rootParent(child, 'contains' as any);
assert(root === parent, 'rootParent finds root');
assert(!wouldCreateCycle(parent, child, ['contains' as any]), 'no cycle on existing edge');
assert(wouldCreateCycle(child, parent, ['contains' as any]), 'detects would-be cycle');

console.log('17. persistence sink');
assert(persistenceCalls.includes('putAttrArray'), 'persistence.onPutAttrArray called');
assert(persistenceCalls.includes('addRelation'), 'persistence.onAddRelation called');

console.log('18. destroyEntity');
const tempId = createEntity('Thread' as EARS.Entity);
putAttr(tempId, EARS.AttrKind.Custom('x'), 1);
destroyEntity(tempId);
assert(!getAllEntities().includes(tempId), 'destroyEntity removes from index');
assert(getAttr(tempId, EARS.AttrKind.Custom('x')) === null, 'destroyEntity removes attrs');
assert(persistenceCalls.some(c => c.startsWith('destroy:')), 'persistence.onDestroyEntity called');

console.log('19. clearMemory');
clearMemory();
assert(getAllEntities().length === 0, 'clearMemory empties store');
assert(Object.keys(relationIndex).length === 0, 'clearMemory empties relation index');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
