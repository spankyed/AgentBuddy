import type {DatabaseSurfaceState} from '../../agentbuddy-ui/database/databaseTypes';
import {textReveal} from './timeline';

const query = [
  '// Query launch related threads with their data',
  'return qx(EARS.Entity.Thread)',
  "  .where('project', 'AgentBuddy')",
  "  .where('status', 'active')",
  '  .limit(10)',
  '  .pickAll();',
].join('\n');

export const databaseSurfaceState: DatabaseSurfaceState = {
  activeMode: 'query',
  error: null,
  examples: [
    {
      title: 'Recent threads',
      description: 'Fetch active launch-related thread entities.',
      query: "return qx(EARS.Entity.Thread)\n  .where('status', 'active')\n  .limit(10)\n  .pickAll();",
    },
    {
      title: 'Notes with references',
      description: 'Find notes connected to launch threads.',
      query: "return qx(EARS.Entity.Note)\n  .where('project', 'AgentBuddy')\n  .include('references')\n  .pickAll();",
    },
    {
      title: 'Workflow events',
      description: 'Inspect automation events emitted this session.',
      query: "return qx(EARS.Entity.Event)\n  .where('scope', 'workflow')\n  .orderBy('createdAt', 'desc')\n  .limit(25);",
    },
  ],
  executionTime: 42.18,
  isAiQueryLoading: false,
  isLoading: false,
  mode: 'query',
  query,
  resultHeaders: ['id', 'title', 'status', 'updatedAt'],
  resultRows: [
    {id: 'Thread-launch-film', title: 'AgentBuddy launch film', status: 'active', updatedAt: '10:42'},
    {id: 'Thread-pr-review', title: 'React launch film PR', status: 'active', updatedAt: '10:41'},
    {id: 'Thread-release-checks', title: 'Release automation checks', status: 'active', updatedAt: '10:39'},
    {id: 'Thread-notes-sync', title: 'Linked notes sync', status: 'active', updatedAt: '10:38'},
  ],
  schema: [
    {
      id: 'entities',
      label: 'Entities',
      color: 'blue',
      count: 5,
      expanded: true,
      items: [
        {id: 'entity:Thread', label: 'Thread', selected: true},
        {id: 'entity:Message', label: 'Message'},
        {id: 'entity:Note', label: 'Note'},
        {id: 'entity:Flow', label: 'Flow'},
        {id: 'entity:Action', label: 'Action'},
      ],
    },
    {
      id: 'attributes',
      label: 'Attributes',
      color: 'green',
      count: 5,
      expanded: true,
      items: [
        {id: 'attribute:title', label: 'title'},
        {id: 'attribute:status', label: 'status'},
        {id: 'attribute:project', label: 'project'},
        {id: 'attribute:updatedAt', label: 'updatedAt'},
        {id: 'attribute:owner', label: 'owner'},
      ],
    },
    {
      id: 'relations',
      label: 'Relations',
      color: 'purple',
      count: 3,
      expanded: true,
      items: [
        {id: 'relation:contains', label: 'contains'},
        {id: 'relation:references', label: 'references'},
        {id: 'relation:created_from', label: 'created_from'},
      ],
    },
  ],
  searchQuery: '',
  statusMessage: 'Query executed successfully',
};

export function databaseSurfaceStateForFrame(frame: number): DatabaseSurfaceState {
  if (frame < 64) {
    return {
      ...databaseSurfaceState,
      executionTime: null,
      query: textReveal(query, frame, 8, 64),
      resultRows: [],
      statusMessage: undefined,
    };
  }
  if (frame < 104) {
    return {
      ...databaseSurfaceState,
      isLoading: true,
      isAiQueryLoading: frame < 82,
      resultRows: [],
      statusMessage: undefined,
    };
  }
  return databaseSurfaceState;
}
