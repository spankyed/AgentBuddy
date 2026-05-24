import type {GitFile} from '../../agentbuddy-ui/code/GitFileItem';

export type CodeReviewState = {
  branch: string;
  breadcrumbs: string[];
  changes: GitFile[];
  commits: Array<{
    hash: string;
    time: string;
    title: string;
  }>;
  diff: {
    fileName: string;
    lineStart: number;
    lines: Array<{
      kind: 'add' | 'remove' | 'context';
      text: string;
    }>;
  };
  generatedCommitMessage: string;
  staged: GitFile[];
  worktrees: Array<{
    branch: string;
    current?: boolean;
    path: string;
  }>;
};

export const codeReviewState: CodeReviewState = {
  branch: 'as/react-launch-film',
  breadcrumbs: ['Code', 'Launch Film', 'Branch'],
  diff: {
    fileName: 'AgentBuddyFilm.tsx',
    lineStart: 24,
    lines: [
      {kind: 'context', text: 'export async function prepareLaunchPlan(context) {'},
      {kind: 'add', text: '  const notes = await memory.collectLinkedNotes(context);'},
      {kind: 'add', text: '  const tickets = await threads.createExecutionTickets(notes);'},
      {kind: 'remove', text: '  await handoff.writeChecklist(tickets);'},
      {kind: 'add', text: '  await workflows.scheduleReleaseChecks(tickets);'},
      {kind: 'context', text: '}'},
    ],
  },
  generatedCommitMessage: 'feat(video): align launch film surfaces with app UI',
  staged: [
    {path: 'packages/video/src/film/AgentBuddyFilm.tsx', status: 'modified'},
  ],
  changes: [
    {path: 'packages/video/src/agentbuddy-ui/threads/KanbanBoard.tsx', status: 'modified'},
    {path: 'packages/video/src/agentbuddy-ui/code/CodeDiffView.tsx', status: 'added'},
    {path: 'packages/video/src/film/state/timeline.ts', status: 'modified'},
  ],
  commits: [
    {hash: '9f42c8a', title: 'Improve launch film code surface', time: '2m ago'},
    {hash: '77bb1e4', title: 'Align tasklist rows with renderer', time: '18m ago'},
    {hash: '43d0ac9', title: 'Add Remotion app chrome primitives', time: '1h ago'},
  ],
  worktrees: [
    {branch: 'as/react-launch-film', path: '~/AgentBuddy', current: true},
    {branch: 'main', path: '~/AgentBuddy-main'},
  ],
};
