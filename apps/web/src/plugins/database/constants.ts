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

// Relation queries (using actual relations from the data):
// return qx('Thread-1').linksTo('CONTAINS', EARS.Entity.Message).pick(['id', 'text', 'sender']);
// return qx(EARS.Entity.Thread).linksTo('HAS', EARS.Entity.Tag).pick(['id', 'name', 'color']);
// return qx('Thread-4').linksTo('PARENT_OF', EARS.Entity.Thread).pick(['id', 'topic', 'status']);

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
// This shows all entities that have outgoing ${value} relations

// Method 1: Get all source entities with their targets
const results = [];

// Get all entities
const allEntities = getAllEntities();

for (const entityId of allEntities) {
  // Find all entities this one relates to via ${value}
  const targets = qx(entityId).linksTo('${value}', Object.values(EARS.Entity)).ids();
  
  if (targets.length > 0) {
    // Get full data for the source entity
    const entityData = qx(entityId).pickOne(['id']);
    const allData = getAll(entityId);
    
    results.push({
      ...entityData,
      ...allData,
      _relationInfo: {
        relationType: '${value}',
        targetCount: targets.length,
        targets: targets.slice(0, 5).map(targetId => ({
          id: targetId,
          type: targetId.split('-')[0]
        }))
      }
    });
  }
}

// If no results, provide helpful feedback
if (results.length === 0) {
  // Get all unique relation types in the system
  const allRelations = new Set();
  for (const entityId of allEntities) {
    // Check common relation types
    ['CONTAINS', 'HAS', 'PARENT_OF', 'RELATED_TO', 'REFERENCES'].forEach(relType => {
      if (qx(entityId).linksTo(relType, Object.values(EARS.Entity)).count() > 0) {
        allRelations.add(relType);
      }
    });
  }
  
  return [{
    message: 'No entities found with "${value}" relations',
    hint: 'Available relation types in the database:',
    availableRelations: Array.from(allRelations),
    example: allRelations.size > 0 
      ? 'Try querying for: ' + Array.from(allRelations)[0]
      : 'No relations found in the database'
  }];
}

return results.slice(0, 20);

// Method 2: Simple list of sources and targets
// const pairs = [];
// for (const source of getAllEntities()) {
//   const targets = qx(source).linksTo('${value}', Object.values(EARS.Entity)).ids();
//   targets.forEach(target => {
//     pairs.push({ source, target, relation: '${value}' });
//   });
// }
// return pairs.slice(0, 50);

// Method 3: Using edgeIds to find relation entities
// const relationIds = [];
// for (const entityId of getAllEntities()) {
//   const edges = qx(entityId).edgeIds(['${value}'], true);
//   edges.forEach(edgeId => relationIds.push(edgeId));
// }
// return qx(relationIds).distinct().limit(20).pick(['source', 'target', 'kind']);`
