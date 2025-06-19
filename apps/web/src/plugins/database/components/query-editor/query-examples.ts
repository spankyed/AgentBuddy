export interface QueryExample {
  title: string;
  description: string;
  query: string;
}

export const queryExamples: QueryExample[] = [
  // Basic Entity Queries
  {
    title: 'Get All Entity Attributes',
    description: 'Retrieve all attributes of a specific entity by ID',
    query: `return qx('Thread-1').pickAll();`
  },
  {
    title: 'Recent Messages',
    description: 'Get messages ordered by timestamp',
    query: `return qx(EARS.Entity.Message).orderBy('timestamp', 'desc').limit(10).pick(['id', 'text', 'timestamp']);`
  },
  {
    title: 'Active Threads Query',
    description: 'Get active threads ordered by timestamp',
    query: `return qx(EARS.Entity.Thread).where('status', 'active').limit(5).pickAll();`
  },
  {
    title: 'Ordered Tags Query',
    description: 'Using ofType, get tags ordered by name',
    query: `return qx().ofType(EARS.Entity.Tag).orderBy('name').pick(['id', 'name', 'color']);`
  },
  // {
  //   title: 'Query All Threads',
  //   description: 'Retrieve all threads with a limit of 10',
  //   query: `return qx(EARS.Entity.Thread).limit(10).pick(['id', 'topic', 'status', 'threadType', 'timestamp']);`
  // },
  // {
  //   title: 'Filter Active Agents',
  //   description: 'Get all agents with active status',
  //   query: `return qx(EARS.Entity.Agent).where('status', 'active').pickAll();`
  // },
  {
    title: 'Query Any Attribute Type',
    description: 'Query entities by label with limit',
    query: `return qx().where('label').limit(20).pick(['id', 'label']);`
  },
  {
    title: 'Distinct Flow Roles',
    description: 'Get unique flow roles',
    query: `return qx(EARS.Entity.Flow).distinct('role').pick(['id', 'name', 'role']);`
  },

  // Relation Queries
  {
    title: 'Thread Messages',
    description: 'Get messages contained in a specific thread',
    query: `return qx('Thread-1').linksTo('contains', EARS.Entity.Message).pick(['id', 'text', 'sender']);`
  },
  {
    title: 'Thread Tags',
    description: 'Get tags associated with threads',
    query: `return qx(EARS.Entity.Thread).linksTo('has', EARS.Entity.Tag).pick(['id', 'name', 'color']);`
  },
  {
    title: 'Thread Hierarchy',
    description: 'Get child threads of a parent thread',
    query: `return qx('Thread-4').linksTo('parent_of', EARS.Entity.Thread).pick(['id', 'topic', 'status']);`
  },

  // Advanced Queries
  {
    title: 'Pagination Example',
    description: 'Paginate through threads',
    query: `const { items, nextCursor } = qx(EARS.Entity.Thread).page(10);
return items;`
  },
  {
    title: 'Single User Lookup',
    description: 'Find a specific user by email',
    query: `return qx(EARS.Entity.User).where('email', 'user@example.com').pickOne(['id', 'name']);`
  },
  {
    title: 'Count Completed Threads',
    description: 'Get count of completed threads',
    query: `return qx(EARS.Entity.Thread).where('status', 'completed').count();`
  },
  {
    title: 'Group Threads by Status',
    description: 'Group threads by their status',
    query: `const grouped = qx(EARS.Entity.Thread).groupBy('status');
// Returns Map<status, qx>
return Array.from(grouped.entries()).map(([status, items]) => ({
  status,
  count: items.count()
}));`
  },
  {
    title: 'Get Entity IDs Only',
    description: 'Retrieve just the IDs of active threads',
    query: `return qx(EARS.Entity.Thread).where('active', true).ids();`
  },

  // Method Chaining Order
  {
    title: 'Correct Method Chain Order',
    description: 'Example showing proper method chaining order',
    query: `// IMPORTANT: Chain methods in this order:
// 1. Filters/Transforms: ofType(), where(), withRole(), orderBy(), limit(), distinct()
// 2. Projections (terminal): pick(), pickAll(), pickOne(), ids(), count()

return qx(EARS.Entity.Thread)
  .where('status', 'active')
  .orderBy('timestamp', 'desc')
  .limit(10)
  .pick(['id', 'topic', 'status']);`
  },

  // Entity Type Queries
  {
    title: 'Query Entity by Type',
    description: 'Query all entities of a specific type with various options',
    query: `// Basic query
return qx(EARS.Entity.Thread).limit(20).pickAll();

// With ordering
// return qx(EARS.Entity.Thread).orderBy('timestamp', 'desc').limit(10).pick(['id', 'name']);

// Count by status
// return qx(EARS.Entity.Thread).where('status', 'active').count();

// Distinct values
// return qx(EARS.Entity.Thread).distinct('type').pick(['id', 'type']);`
  },

  // Attribute Queries
  {
    title: 'Query by Attribute',
    description: 'Find entities with specific attributes',
    query: `// Find entities with 'status' attribute
return qx().where('status').limit(20).pick(['id', 'status']);

// With specific value
// return qx().where('status', 'active').pickAll();

// Ordered by attribute
// return qx().where('priority').orderBy('priority').limit(10).pick(['id', 'priority']);

// Count entities with attribute
// return qx().where('label').count();`
  },

  // Complex Relation Query
  {
    title: 'Explore Relations',
    description: 'Find entities with specific relation types',
    query: `// Find all entities with outgoing contains relations
const results = [];
const allEntities = qx().ids();

for (const entityId of allEntities) {
  const targets = qx(entityId).linksTo('contains', Object.values(EARS.Entity)).ids();
  
  if (targets.length > 0) {
    const entityData = qx(entityId).pickOne(['id']);
    const allData = getAll(entityId);
    
    results.push({
      ...entityData,
      ...allData,
      relationType: 'contains',
      targetCount: targets.length,
      targets: targets.slice(0, 5).map(targetId => ({
        id: targetId,
        type: targetId.split('-')[0]
      }))
    });
  }
}

return results.slice(0, 20);`
  },

  // Helper Functions
  {
    title: 'Find Available Relations',
    description: 'Discover what relation types exist in the database',
    query: `// Get all unique relation types in the system
const allRelations = new Set();
const allEntities = qx().ids();

for (const entityId of allEntities) {
  // Check common relation types
  ['contains', 'has', 'parent_of', 'blocked_by'].forEach(relType => {
    if (qx(entityId).linksTo(relType, Object.values(EARS.Entity)).count() > 0) {
      allRelations.add(relType);
    }
  });
}

return {
  availableRelations: Array.from(allRelations),
  count: allRelations.size
};`
  }
]; 