import type {DatabaseSurfaceState, QueryExample} from '../../agentbuddy-ui/database/databaseTypes';

const queryExamples: QueryExample[] = [
  {
    title: 'Recent Messages',
    description: 'Get messages ordered by timestamp',
    query: "return qx(EARS.Entity.Message).orderBy('timestamp', 'desc').limit(10).pick(['text', 'sender', 'timestamp']);",
  },
  {
    title: 'Active Threads',
    description: 'Get active threads',
    query: "return qx(EARS.Entity.Thread).where('status', 'active').limit(5).pickAll();",
  },
  {
    title: 'Thread Messages',
    description: 'Get messages contained in a specific thread',
    query: "const threadId = qx(EARS.Entity.Thread).first();\nreturn qx(threadId).linksTo('contains', EARS.Entity.Message).pick(['text', 'sender', 'timestamp']);",
  },
  {
    title: 'Flows with Node Counts',
    description: 'List flows with the number of nodes in each',
    query: "return qx(EARS.Entity.Flow).pick(['label', 'description']).map(f => ({\n  ...f,\n  nodeCount: qx(f.id).linksTo('contains', EARS.Entity.Node).count()\n}));",
  },
];

export const databaseSurfaceState: DatabaseSurfaceState = {
  activeMode: 'query',
  aiPrompt: '',
  currentQuery: `return qx(EARS.Entity.Thread)
  .where('status', 'active')
  .orderBy('updatedAt', 'desc')
  .limit(5)
  .pick(['topic', 'status', 'updatedAt']);`,
  error: null,
  examples: queryExamples,
  executionTime: 42.18,
  isAiPromptOpen: false,
  isAiQueryLoading: false,
  isLoading: false,
  mode: 'query',
  queryResult: [
    {id: 'thread-launch-film', status: 'active', topic: 'AgentBuddy launch film', updatedAt: '2026-05-25T14:18:22Z'},
    {id: 'thread-release-plan', status: 'active', topic: 'Release checklist', updatedAt: '2026-05-25T13:42:09Z'},
    {id: 'thread-pr-review', status: 'active', topic: 'PR review surface', updatedAt: '2026-05-25T12:57:44Z'},
    {id: 'thread-demo-script', status: 'active', topic: 'Demo script polish', updatedAt: '2026-05-25T12:11:03Z'},
  ],
  schema: {
    attributes: [
      {kind: 'topic'},
      {kind: 'status'},
      {kind: 'updatedAt'},
      {kind: 'sender'},
      {kind: 'text'},
      {kind: 'label'},
    ],
    entities: [
      {type: 'Thread'},
      {type: 'Message'},
      {type: 'Note'},
      {type: 'Flow'},
      {type: 'Action'},
      {type: 'Prompt'},
    ],
    relations: [
      {kind: 'contains'},
      {kind: 'parent_of'},
      {kind: 'references'},
      {kind: 'created_by'},
    ],
  },
  searchQuery: '',
  selectedSchemaItemId: 'entity:Thread',
  successMessage: 'Query executed successfully',
};

export const databaseExamplesState: DatabaseSurfaceState = {
  ...databaseSurfaceState,
  activeMode: 'examples',
};

export const databaseAiLoadingState: DatabaseSurfaceState = {
  ...databaseSurfaceState,
  aiPrompt: 'Show the five most active launch threads',
  isAiPromptOpen: false,
  isAiQueryLoading: true,
  queryResult: null,
  successMessage: '',
};

export function databaseSurfaceStateForFrame(frame: number): DatabaseSurfaceState {
  if (frame < 80) return databaseExamplesState;
  if (frame < 130) return {...databaseSurfaceState, aiPrompt: 'Show the five most active launch threads', isAiPromptOpen: true, queryResult: null, successMessage: ''};
  if (frame < 160) return databaseAiLoadingState;
  return databaseSurfaceState;
}
