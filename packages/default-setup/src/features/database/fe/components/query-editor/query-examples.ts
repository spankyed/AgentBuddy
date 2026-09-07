export interface QueryExample {
  title: string;
  description: string;
  query: string;
}

export const queryExamples: QueryExample[] = [
  {
    title: 'Recent Messages',
    description: 'Get messages ordered by timestamp',
    query: `return qx(EARS.Entity.Message).orderBy('timestamp', 'desc').limit(10).pick(['text', 'sender', 'timestamp']);`
  },
  {
    title: 'Active Threads',
    description: 'Get active threads',
    query: `return qx(EARS.Entity.Thread).where('status', 'active').limit(5).pickAll();`
  },

  // Relation Queries
  {
    title: 'Thread Messages',
    description: 'Get messages contained in a specific thread',
    query: `const threadId = qx(EARS.Entity.Thread).first();\nreturn qx(threadId).linksTo('contains', EARS.Entity.Message).pick(['text', 'sender', 'timestamp']);`
  },
  {
    title: 'Thread Hierarchy',
    description: 'Get child threads of a parent thread',
    query: `const threadId = qx(EARS.Entity.Thread).first();\nreturn qx(threadId).linksTo('parent_of', EARS.Entity.Thread).pick(['topic', 'status']);`
  },

  // Advanced Queries
  {
    title: 'Flows with Node Counts',
    description: 'List flows with the number of nodes in each',
    query: `return qx(EARS.Entity.Flow).pick(['label', 'description']).map(f => ({\n  ...f,\n  nodeCount: qx(f.id).linksTo('contains', EARS.Entity.Node).count()\n}));`
  },
];
