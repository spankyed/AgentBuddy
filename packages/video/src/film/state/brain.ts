import type {BrainSurfaceState} from '../../agentbuddy-ui/brain/brainTypes';

const baseTime = Date.UTC(2026, 4, 25, 14, 34, 18);

export const brainSurfaceState: BrainSurfaceState = {
  canGoBack: false,
  events: [
    {eventType: 'launch.context.updated', id: 'event-context', label: 'Launch context updated', scope: 'app', triggerType: 'listener'},
    {eventType: 'release.workflow.scheduled', id: 'event-release', label: 'Release workflow scheduled', scope: 'app', triggerType: 'schedule'},
    {eventType: 'code.branch.published', id: 'event-code', label: 'Code branch published', scope: 'app', triggerType: 'listener'},
  ],
  flowTNodeId: 'TNode-Root',
  pulsingEventType: 'code.branch.published',
  selectedNodeId: 'draft-report',
  showLeftPanel: true,
  tracks: [
    {
      children: [
        {
          children: [
            {
              id: 'draft-report',
              kind: 'action',
              label: 'Draft launch report',
              nodeAttributes: {
                reportType: 'launch-summary',
                result: {
                  sections: ['context', 'assets', 'release checks'],
                  status: 'ready',
                },
              },
              completedAt: baseTime + 5400,
              startedAt: baseTime + 3000,
              status: 'completed',
              stepNodeType: 'action',
            },
            {
              children: [
                {
                  id: 'notify-team',
                  kind: 'action',
                  label: 'Notify release team',
                  startedAt: baseTime + 7000,
                  status: 'active',
                  stepNodeType: 'action',
                },
              ],
              id: 'run-publish-flow',
              kind: 'flow',
              label: 'Run publish workflow',
              status: 'active',
              stepNodeType: 'flow',
            },
          ],
          exits: ['report', 'publish'],
          id: 'branch-published',
          kind: 'listener',
          label: 'Branch published',
          completedAt: baseTime + 1800,
          eventType: 'code.branch.published',
          startedAt: baseTime,
          status: 'completed',
          subtitle: 'code.branch.published',
        },
      ],
      id: 'release-root',
      kind: 'entry',
      label: 'Release automation',
      status: 'completed',
      subtitle: 'launch.release',
    },
  ],
};

export const brainPausedState: BrainSurfaceState = {
  ...brainSurfaceState,
  brainIsPaused: true,
  selectedNodeId: undefined,
};

export const brainStoppedState: BrainSurfaceState = {
  ...brainSurfaceState,
  brainIsDead: true,
  selectedNodeId: undefined,
};
