export const exampleQuery =
`// Example queries - modify and run to explore the database
// 
// IMPORTANT: Chain methods in this order:
// 1. Filters/Transforms: ofType(), where(), withRole(), orderBy(), limit(), distinct()
// 2. Projections (terminal): pick(), pickAll(), pickOne(), ids(), count()

// Query all threads with their data
return qx(EARS.Entity.Thread).limit(10).pick(['id', 'topic', 'status', 'threadType', 'timestamp']);

// Or try these examples:
// return qx(EARS.Entity.Agent).where('status', 'active').pickAll();
// return qx().where('label').limit(20).pick(['id', 'label']);
// return qx(EARS.Entity.Tag).orderBy('name').pick(['id', 'name', 'color']);

// More examples:
// return qx(EARS.Entity.Task).where('status', 'pending').orderBy('timestamp', 'desc').limit(5).pickAll();
// return qx().ofType(EARS.Entity.Message).reverse().limit(10).pick(['id', 'content', 'timestamp']);
// return qx(EARS.Entity.User).distinct('role').pick(['id', 'name', 'role']);

// Advanced examples:
// Pagination: const { items, nextCursor } = qx(EARS.Entity.Thread).page(10);
// Single result: return qx(EARS.Entity.User).where('email', 'user@example.com').pickOne(['id', 'name']);
// Count: return qx(EARS.Entity.Task).where('status', 'completed').count();
// Group by: const grouped = qx(EARS.Entity.Task).groupBy('status'); // Returns Map<status, qx>
// Just IDs: return qx(EARS.Entity.Agent).where('active', true).ids();`

export const entityQueryTemplate = (value: string) =>
  `// Query all ${value} entities
return qx(EARS.Entity.${value}).limit(20).pickAll();

// Other options:
// return qx(EARS.Entity.${value}).orderBy('timestamp', 'desc').limit(10).pick(['id', 'name']);
// return qx(EARS.Entity.${value}).where('status', 'active').count();
// return qx(EARS.Entity.${value}).distinct('type').pick(['id', 'type']);`

export const attributeQueryTemplate = (value: string) =>
  `// Query entities with ${value} attribute
return qx().where('${value}').limit(20).pick(['id', '${value}']);

// Other options:
// return qx().where('${value}', 'specific-value').pickAll();
// return qx().where('${value}').orderBy('${value}').limit(10).pick(['id', '${value}']);
// return qx().where('${value}').count(); // Count entities with this attribute`

export const relationQueryTemplate = (value: string) =>
`// Query entities with ${value} relations
// Method 1: Manual traversal (shows relation details)
const sources = [];
const allIds = getAllEntities();

for (const sourceId of allIds) {
  const targets = qx(sourceId).related('${value}', sourceId, true).ids();
  if (targets.length > 0) {
    const sourceData = getAll(sourceId);
    sources.push({
      id: sourceId,
      type: sourceId.split('-')[0],
      targetCount: targets.length,
      targets: targets.slice(0, 3), // Show first 3 targets
      ...sourceData
    });
  }
}

return sources.slice(0, 20);

// Method 2: Using linksTo for traversal (cleaner but less detail)
// return qx(EARS.Entity.Thread).linksTo('${value}', EARS.Entity.Agent).limit(10).pickAll();

// Method 3: Get all entities related to a specific target
// const targetId = 'agent-123'; // Replace with actual ID
// return qx().relatedTo(targetId).limit(20).pick(['id', 'type']);`
