import type {LogsSurfaceState} from '../../agentbuddy-ui/logs/logTypes';

export const logsSurfaceState: LogsSurfaceState = {
  appEventsEnabled: true,
  copied: false,
  excludedSources: 2,
  filterLevel: 'all',
  searchTerm: '',
  logs: [
    {id: '1', level: 'info', message: 'release workflow completed for launch_agentbuddy', source: 'workers', timestamp: '10:42:31', expanded: true, meta: {workflow: 'release-checks', status: 'complete'}},
    {id: '2', level: 'info', message: 'scheduled linkedin and x distribution checks', source: 'scheduler', timestamp: '10:42:29'},
    {id: '3', level: 'debug', message: 'resolved linked notes and source artifacts', source: 'brain', timestamp: '10:42:27', meta: {notes: 9, artifacts: 4}},
    {id: '4', level: 'info', message: 'pull request #128 created from as/react-launch-film', source: 'code', timestamp: '10:42:21'},
    {id: '5', level: 'warn', message: 'retrying launch page preview webhook after 429', source: 'webhooks', timestamp: '10:42:18'},
    {id: '6', level: 'error', message: 'stale preview worker ignored recovered event', source: 'webhooks', timestamp: '10:42:13'},
    {id: '7', level: 'debug', message: 'loaded tasklist context from notes/current', source: 'notes', timestamp: '10:42:04'},
  ],
};

export function logsSurfaceStateForFrame(frame: number): LogsSurfaceState {
  if (frame < 70) {
    return {
      ...logsSurfaceState,
      logs: logsSurfaceState.logs.slice(0, 4),
    };
  }
  if (frame < 130) {
    return {
      ...logsSurfaceState,
      filterLevel: 'warn',
      searchTerm: 'webhook',
      logs: logsSurfaceState.logs.filter(log => log.source === 'webhooks'),
    };
  }
  return {
    ...logsSurfaceState,
    copied: true,
  };
}
