import type {BrainSurfaceState} from '../../agentbuddy-ui/brain/brainTypes';

export const brainSurfaceState: BrainSurfaceState = {
  activeMemoryId: 'launch-thread',
  memories: [
    {id: 'launch-thread', label: 'Launch AgentBuddy', kind: 'thread', strength: 96},
    {id: 'tasklist', label: 'Tasklist / current', kind: 'note', strength: 88},
    {id: 'pr-context', label: 'PR #128 context', kind: 'code', strength: 82},
    {id: 'release-checks', label: 'Release checks', kind: 'workflow', strength: 74},
    {id: 'launch-copy', label: 'Launch copy', kind: 'note', strength: 69},
  ],
  selectedMemory: {
    title: 'Launch AgentBuddy',
    facts: [
      'The current film must show real plugin breadth, not fake montage filler.',
      'The active branch is as/react-launch-film.',
      'Code, PR, flows, notes, threads, database, logs, and settings surfaces are part of the launch story.',
    ],
  },
  traces: [
    {id: 'trace-1', summary: 'Resolved linked launch notes', time: '10:42', tokens: '8.2k tokens'},
    {id: 'trace-2', summary: 'Loaded source-control PR context', time: '10:41', tokens: '3.1k tokens'},
    {id: 'trace-3', summary: 'Connected workflow run outputs', time: '10:39', tokens: '2.4k tokens'},
  ],
};
