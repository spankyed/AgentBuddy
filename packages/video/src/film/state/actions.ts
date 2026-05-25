import type {ActionsSurfaceState} from '../../agentbuddy-ui/actions/actionTypes';

export const actionsSurfaceState: ActionsSurfaceState = {
  categories: [
    {name: 'database', color: '#60a5fa'},
    {name: 'communication', color: '#4ade80'},
    {name: 'integration', color: '#facc15'},
    {name: 'utility', color: '#c084fc'},
  ],
  actions: [
    {
      id: 'action-release-checklist',
      label: 'Generate release checklist',
      description: 'Collect linked notes and source context into launch tasks.',
      category: 'utility',
      inputs: ['threadId', 'branch', 'targets'],
    },
    {
      id: 'action-query-launch',
      label: 'Query launch events',
      description: 'Read launch workflow events from the database.',
      category: 'database',
      inputs: ['project', 'status'],
    },
    {
      id: 'action-publish-summary',
      label: 'Publish branch summary',
      description: 'Send the generated PR summary to the launch thread.',
      category: 'communication',
      inputs: ['prNumber'],
    },
  ],
};
