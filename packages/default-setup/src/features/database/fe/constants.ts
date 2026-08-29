export const exampleQuery =
  `// Query all threads with their data
return qx(EARS.Entity.Thread).limit(10).pickAll();

// Or try these examples:
// return qx(EARS.Entity.Thread).where('status', 'active').pickAll();
// return qx().where('label').limit(20).pick(['label']);
// return qx(EARS.Entity.Flow).orderBy('label').pick(['label', 'description']);
// return qx(EARS.Entity.Message).reverse().limit(10).pick(['text', 'sender', 'timestamp']);
// return qx('Thread-1').linksTo('contains', EARS.Entity.Message).pick(['text', 'sender']);
// return qx('Thread-1').linksPick('contains', ['text', 'sender'], EARS.Entity.Message);

// IMPORTANT: Chain methods in this order:
// 1. Filters/Shaping: ofType(), where(), withRole(), orderBy(), limit(), distinct(), reverse()
// 2. Terminals: pick(), pickAll(), pickOne(), ids(), count(), first(), exists()
`


export const entityQueryTemplate = (value: string) =>
  `return qx(EARS.Entity.${value}).limit(20).pickAll();`

export const attributeQueryTemplate = (value: string) =>
  `return qx().where('${value}').limit(20).pick(['${value}']);`

export const relationQueryTemplate = (value: string) =>
  `// Query entities with ${value} relations
const results = [];
const allEntities = getAllEntities();

for (const entityId of allEntities) {
  const targets = qx(entityId).linksTo('${value}').ids();

  if (targets.length > 0) {
    const allData = getAll(entityId);

    results.push({
      source: entityId,
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
  .link(EARS.RelKind.CONTAINS, agentId)
  .id();

return {
  created: { agentId, threadId },
  message: 'Successfully created agent and thread'
};

// More transaction examples:
// Delete an entity: tx(entityId).destroy();
// Grant/revoke roles: tx(entityId).grant('admin').revoke('user');
// Batch operations: tx(id).batchPut({ name: 'New Name', status: 'updated' });
`
