import type {CodeReviewState, CodeReviewViewState} from '../../agentbuddy-ui/code/codeTypes';
import {ease} from './timeline';

export type CodeShotState = {
  breadcrumbs: string[];
  generatedCommitMessage: string;
  review: CodeReviewState;
};

export const codeShotState: CodeShotState = {
  breadcrumbs: ['Code'],
  generatedCommitMessage: 'feat(video): align launch film surfaces with app UI',
  review: {
    baseDirectory: '/Users/spankyed/Develop/Projects/AgentBuddy',
    branch: 'as/react-launch-film',
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
    pullRequest: {
      baseBranch: 'main',
      body: 'Align the launch film with the real AgentBuddy UI and add reusable Remotion surfaces for future product demos.',
      branchPublished: false,
      changedFiles: [
        {path: 'packages/video/src/agentbuddy-ui/code/PullRequestPanel.tsx', status: 'added'},
        {path: 'packages/video/src/agentbuddy-ui/code/PRComparison.tsx', status: 'added'},
        {path: 'packages/video/src/agentbuddy-ui/code/CreatePRForm.tsx', status: 'added'},
        {path: 'packages/video/src/agentbuddy-ui/code/PRInfo.tsx', status: 'added'},
        {path: 'packages/video/src/agentbuddy-ui/code/PRActionBar.tsx', status: 'added'},
        {path: 'packages/video/src/film/state/code.ts', status: 'modified'},
        {path: 'packages/video/src/compositions/demos/CodeDemos.tsx', status: 'modified'},
      ],
      checks: [
        'Preview build passed',
        'Release checks passed',
      ],
      createdPr: {
        number: 128,
        state: 'OPEN',
        url: 'https://github.com/clientlabs/agentbuddy/pull/128',
      },
      fileTree: [
        {
          id: 'packages',
          label: 'packages',
          type: 'folder',
          count: 7,
          children: [
            {
              id: 'packages/video',
              label: 'video',
              type: 'folder',
              count: 7,
              children: [
                {
                  id: 'packages/video/src',
                  label: 'src',
                  type: 'folder',
                  count: 7,
                  children: [
                    {
                      id: 'packages/video/src/agentbuddy-ui',
                      label: 'agentbuddy-ui',
                      type: 'folder',
                      count: 5,
                      children: [
                        {
                          id: 'packages/video/src/agentbuddy-ui/code',
                          label: 'code',
                          type: 'folder',
                          count: 5,
                          children: [
                            {id: 'PullRequestPanel.tsx', label: 'PullRequestPanel.tsx', type: 'file', status: 'added'},
                            {id: 'PRComparison.tsx', label: 'PRComparison.tsx', type: 'file', status: 'added'},
                            {id: 'CreatePRForm.tsx', label: 'CreatePRForm.tsx', type: 'file', status: 'added'},
                            {id: 'PRInfo.tsx', label: 'PRInfo.tsx', type: 'file', status: 'added'},
                            {id: 'PRActionBar.tsx', label: 'PRActionBar.tsx', type: 'file', status: 'added'},
                          ],
                        },
                      ],
                    },
                    {
                      id: 'packages/video/src/film',
                      label: 'film',
                      type: 'folder',
                      count: 1,
                      children: [
                        {id: 'code.ts', label: 'code.ts', type: 'file', status: 'modified'},
                      ],
                    },
                    {
                      id: 'packages/video/src/compositions',
                      label: 'compositions',
                      type: 'folder',
                      count: 1,
                      children: [
                        {id: 'CodeDemos.tsx', label: 'CodeDemos.tsx', type: 'file', status: 'modified'},
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      headBranch: 'as/react-launch-film',
      title: 'Align launch film with app UI',
    },
    terminal: {
      activeTerminalId: 'terminal-launch',
      expanded: false,
      terminals: [
        {id: 'terminal-launch', shell: 'zsh', title: 'AgentBuddy'},
      ],
    },
  },
};

export function codeReviewViewForFrame(frame: number): CodeReviewViewState {
  return {
    activePanel: frame > 158 ? 'pr' : 'commit',
    commitMessage: frame > 116 ? codeShotState.generatedCommitMessage : '',
    diffLineOpacities: codeShotState.review.diff.lines.map((line, index) =>
      line.kind === 'context' ? 1 : ease(frame, 42 + index * 12, 60 + index * 12),
    ),
    generatingCommitMessage: frame > 76 && frame <= 116,
    prCreated: frame > 224,
    prCreating: frame > 190 && frame <= 224,
    prMode: frame <= 176 ? 'files' : frame <= 224 ? 'create' : 'details',
    prPublishProgress: ease(frame, 158, 188),
  };
}
