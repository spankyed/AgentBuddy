import type {LogsSurfaceState} from '../../agentbuddy-ui/logs/logTypes';

export const logsSurfaceState: LogsSurfaceState = {
  activeService: 'workers',
  filters: ['level:info', 'release'],
  query: 'Search logs...',
  services: [
    {id: 'api', label: 'api', status: 'healthy', count: 184},
    {id: 'workers', label: 'workers', status: 'healthy', count: 342},
    {id: 'webhooks', label: 'webhooks', status: 'warning', count: 27},
    {id: 'scheduler', label: 'scheduler', status: 'healthy', count: 91},
  ],
  streamState: 'connected',
  events: [
    {id: '1', time: '10:42:31', level: 'info', service: 'workers', message: 'release workflow completed for launch_agentbuddy'},
    {id: '2', time: '10:42:29', level: 'info', service: 'workers', message: 'scheduled linkedin and x distribution checks'},
    {id: '3', time: '10:42:27', level: 'debug', service: 'workers', message: 'resolved 9 linked notes and 4 source artifacts'},
    {id: '4', time: '10:42:21', level: 'info', service: 'api', message: 'pull request #128 created from as/react-launch-film'},
    {id: '5', time: '10:42:18', level: 'warn', service: 'webhooks', message: 'retrying launch page preview webhook after 429'},
    {id: '6', time: '10:42:11', level: 'info', service: 'scheduler', message: 'queued release checks for production targets'},
    {id: '7', time: '10:42:04', level: 'debug', service: 'workers', message: 'loaded tasklist context from notes/current'},
    {id: '8', time: '10:41:58', level: 'info', service: 'api', message: 'thread board updated: 3 cards moved to in_progress'},
  ],
};
