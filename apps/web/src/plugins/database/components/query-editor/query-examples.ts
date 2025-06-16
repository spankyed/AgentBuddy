export interface QueryExample {
  title: string;
  description: string;
  query: string;
}

export const queryExamples: QueryExample[] = [
  {
    title: 'Query All Threads',
    description: 'Retrieve all threads with a limit of 10',
    query: `return qx(EARS.Entity.Thread).limit(10);`
  },
  {
    title: 'Filter Active Agents',
    description: 'Get all agents with active status',
    query: `return qx(EARS.Entity.Agent).where('status', 'active');`
  },
  {
    title: 'Query with Relations',
    description: 'Get entities with their relations',
    query: `return qx(EARS.Entity.Flow).linksTo('contains', EARS.Entity.Node);`
  },
  {
    title: 'Complex Join Query',
    description: 'Join multiple entities with conditions',
    query: `return qx(EARS.Entity.Flow)
  .linksTo('contains', EARS.Entity.Node)
  .where('status', 'active')
  .orderBy('createdAt', 'desc')
  .limit(20);`
  },
  {
    title: 'Aggregate Functions',
    description: 'Aggregate functions',
    query: ``
  }
]; 