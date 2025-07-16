// export const exampleQuery = `return qx(EARS.Entity.Thread).limit(10).pickAll();`

export const exampleQuery =
  `// Query all threads with their data
return qx(EARS.Entity.Thread).limit(10).pickAll();

// Or try these examples:
// return qx(EARS.Entity.Thread).where('status', 'active').pickAll();
// return qx().where('label').limit(20).pick(['id', 'label']);
// return qx(EARS.Entity.Tag).orderBy('name').pick(['id', 'name', 'color']);
// return qx(EARS.Entity.User).distinct('role').pick(['id', 'name', 'role']);
// return qx().ofType(EARS.Entity.Message).reverse().limit(10).pick(['id', 'content', 'timestamp']);
// return qx(EARS.Entity.Thread).linksTo('HAS', EARS.Entity.Tag).pick(['id', 'name', 'color']);
// return qx('Thread-1').linksTo('CONTAINS', EARS.Entity.Message).pick(['id', 'text', 'sender']);

// IMPORTANT: Chain methods in this order:
// 1. Filters/Transforms: ofType(), where(), withRole(), orderBy(), limit(), distinct()
// 2. Projections (terminal): pick(), pickAll(), pickOne(), ids(), count()
`


export const entityQueryTemplate = (value: string) =>
  `return qx(EARS.Entity.${value}).limit(20).pickAll();`

export const attributeQueryTemplate = (value: string) =>
  `return qx().where('${value}').limit(20).pick(['id', '${value}']);`

export const relationQueryTemplate = (value: string) =>
  `// Query entities with ${value} relations
const results = [];
const allEntities = getAllEntities();

for (const entityId of allEntities) {
  const targets = qx(entityId).linksTo('${value}', Object.values(EARS.Entity)).ids();
  
  if (targets.length > 0) {
    const entityData = qx(entityId).pickOne(['id']);
    const allData = getAll(entityId);
    
    results.push({
      source: entityData.id,
      relationType: '${value}',
      targets: targets.slice(0, 5),
      targetCount: targets.length,
      ...allData,
    });
  }
}

return results.slice(0, 20);`

export const transactionExampleQuery = 
  `// Create a new agent entity
const agentId = tx(EARS.Entity.Agent)
  .put('name', 'My Assistant')
  .put('description', 'A helpful AI agent')
  .put('status', 'active')
  .grant('primary')
  .id();

// Update existing entity
tx(agentId)
  .put('lastActive', Date.now())
  .merge('capabilities', ['chat', 'analysis']);

// Create relationships
const threadId = tx(EARS.Entity.Thread)
  .put('title', 'New Conversation')
  .put('createdAt', Date.now())
  .link(EARS.RelKind.belongs_to, agentId)
  .id();

return { 
  created: { agentId, threadId },
  message: 'Successfully created agent and thread'
};

// More transaction examples:
// Delete an entity: tx(entityId).destroy();
// Grant/revoke roles: tx(entityId).grant('admin').revoke('user');
// Create symmetric relations: tx(id1).link(EARS.RelKind.relates_to, id2, { symmetric: true });
// Batch operations: tx(id).batchPut({ name: 'New Name', status: 'updated' });
`
