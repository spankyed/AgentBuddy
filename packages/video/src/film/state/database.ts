import type {DatabaseSurfaceState} from '../../agentbuddy-ui/database/databaseTypes';

export const databaseSurfaceState: DatabaseSurfaceState = {
  activeTableId: 'launch_events',
  connectionName: 'AgentBuddy production',
  databases: [
    {
      id: 'agentbuddy',
      label: 'agentbuddy',
      tables: [
        {id: 'threads', label: 'threads', count: 1284},
        {id: 'launch_events', label: 'launch_events', count: 842},
        {id: 'notes', label: 'notes', count: 3912},
        {id: 'workflow_runs', label: 'workflow_runs', count: 267},
      ],
    },
  ],
  detail: {
    title: 'launch_events / selected row',
    fields: [
      {label: 'id', value: 'evt_8a91c2'},
      {label: 'thread_id', value: 'thread_launch_agentbuddy'},
      {label: 'kind', value: 'release.workflow.completed'},
      {label: 'payload', value: '{"checks":"passed","targets":["twitter","linkedin","launch"]}'},
    ],
  },
  query: {
    elapsedMs: 42,
    sql: [
      'SELECT id, kind, actor, created_at, status',
      'FROM launch_events',
      "WHERE status = 'ready'",
      'ORDER BY created_at DESC',
      'LIMIT 8;',
    ].join('\n'),
    status: 'complete',
  },
  rows: [
    {id: '1', selected: true, columns: ['evt_8a91c2', 'release.workflow.completed', 'agent', '10:42:31', 'ready']},
    {id: '2', columns: ['evt_8a91bf', 'pr.created', 'code', '10:41:04', 'ready']},
    {id: '3', columns: ['evt_8a9180', 'tickets.generated', 'threads', '10:39:58', 'ready']},
    {id: '4', columns: ['evt_8a90fd', 'memory.linked', 'notes', '10:38:12', 'ready']},
    {id: '5', columns: ['evt_8a90a1', 'query.saved', 'database', '10:37:45', 'ready']},
    {id: '6', columns: ['evt_8a8ff4', 'automation.queued', 'flows', '10:36:30', 'ready']},
  ],
  tableColumns: ['id', 'kind', 'actor', 'created_at', 'status'],
};
