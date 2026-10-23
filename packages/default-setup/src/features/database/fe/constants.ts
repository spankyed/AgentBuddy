export const exampleQuery =
  `// Query all threads with their data
return query(EARS.Entity.Thread).limit(10).pickAll();

// Or try these examples:
// return query(EARS.Entity.Thread).where('status', 'active').pickAll();
// return query.all().has('label').limit(20).pick(['label']);
// return query(EARS.Entity.Flow).orderBy('label').pick(['label', 'description']);
// return query(EARS.Entity.Message).reverse().limit(10).pick(['text', 'sender', 'timestamp']);
// return query.ids('Thread-1').out('contains', EARS.Entity.Message).pick(['text', 'sender']);
// return query.ids('Message-1').in('contains', EARS.Entity.Thread).pickOne(['topic']);

// IMPORTANT: Chain methods in this order:
// 1. Filters/Shaping: ofType(), where(), has(), lacks(), withRole(), orderBy(), limit(), distinct(), reverse()
// 2. Terminals: pick(), pickAll(), pickOne(), ids(), count(), first(), exists()
`


export const entityQueryTemplate = (value: string) =>
  `return query(EARS.Entity.${value}).limit(20).pickAll();`

export const attributeQueryTemplate = (value: string) =>
  `return query.all().has('${value}').limit(20).pick(['${value}']);`

export const relationQueryTemplate = (value: string) =>
  `// Query entities with ${value} relations
const results = [];
const allEntities = query.all().ids();

for (const entityId of allEntities) {
  const targets = query.ids(entityId).out('${value}').ids();

  if (targets.length > 0) {
    results.push({
      ...getRow(entityId),
      relationType: '${value}',
      targets: targets.slice(0, 5),
      targetCount: targets.length,
    });
  }
}

return results.slice(0, 20);`

export const transactionExampleQuery =
  `// Create a new note entity
const noteId = create(EARS.Entity.Note)
  .set('title', 'My Note')
  .set('content', 'A helpful note')
  .set('noteType', 'document')
  .id();

// Update existing entity
write(noteId)
  .set('lastSeen', Date.now())
  .merge('tags', ['chat', 'analysis']);

// Create relationships
const threadId = create(EARS.Entity.Thread)
  .set('title', 'New Conversation')
  .link(EARS.RelKind.CONTAINS, noteId)
  .id();

return {
  created: { noteId, threadId },
  message: 'Successfully created note and thread'
};

// More transaction examples:
// Delete an entity: write(entityId).destroy();
// Grant/revoke a declared role: write(entityId).grant(EARS.RoleKind.X).revoke(EARS.RoleKind.Y);
// Set several attributes: write(id).setMany({ name: 'New Name', status: 'updated' });
// Get or create by id: upsert(EARS.Entity.Note, id).set('title', 'Kept');
`
