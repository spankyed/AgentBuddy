export interface QueryExample {
  title: string;
  description: string;
  query: string;
}

export const queryExamples: QueryExample[] = [
  {
    title: 'Reset Settings',
    description: 'Reset all settings by destroying all entries in the Settings collection',
    query: `return qx('Settings').ids().forEach(id => tx(id).destroy());`
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

  // Relation Queries
  {
    title: 'Thread Messages',
    description: 'Get messages contained in a specific thread',
    query: `return qx('Thread-1').linksTo('contains', EARS.Entity.Message).pick(['id', 'text', 'sender']);`
  },
  {
    title: 'Thread Hierarchy',
    description: 'Get child threads of a parent thread',
    query: `return qx('Thread-4').linksTo('parent_of', EARS.Entity.Thread).pick(['id', 'topic', 'status']);`
  },

  // Advanced Queries
  {
    title: 'Single User Lookup',
    description: 'Find a specific user by email',
    query: `return qx(EARS.Entity.User).where('email', 'user@example.com').pickOne(['id', 'name']);`
  },
]; 