import type {CodeReviewState, CodeReviewViewState, TerminalPanelState} from '../../agentbuddy-ui/code/codeTypes';
import type {ChatComposerState} from '../../agentbuddy-ui/chat/chatTypes';
import {launchComposerState} from './chat';
import {filmProjects} from './paths';
import {ease, textReveal} from './timeline';

export type CodeShotState = {
  breadcrumbs: string[];
  chromeDemoBreadcrumbs: string[];
  generatedCommitMessage: string;
  review: CodeReviewState;
};

export type CodeShotView = {
  breadcrumbs: string[];
  composer: ChatComposerState;
  review: {
    state: CodeReviewState;
    view: CodeReviewViewState;
  };
};

export const codeShotState: CodeShotState = {
  breadcrumbs: ['Code'],
  chromeDemoBreadcrumbs: ['Code'],
  generatedCommitMessage: 'feat(video): align launch film surfaces',
  review: {
    baseDirectory: filmProjects.agentBuddy,
    branch: 'as/react-launch-film',
    branchSync: {
      commitsAhead: 4,
      commitsBehind: 0,
      hasUpstream: true,
    },
    diff: {
      fileName: 'prepare-launch-pr.ts',
      lineStart: 24,
      lines: [
        {kind: 'context', text: 'export async function run(context) {'},
        {kind: 'add', text: '  const branch = await code.publishBranch(context.branch);'},
        {kind: 'add', text: '  const body = await thread.summarize("launch-pr");'},
        {kind: 'remove', text: '  return github.draftPullRequest(context);'},
        {kind: 'add', text: '  return github.preparePullRequest({ branch, body });'},
        {kind: 'add', text: '  await logs.info("launch PR prepared");'},
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
      {authorName: 'spankyed', hash: '9f42c8a', title: 'Improve launch film code surface', time: '2m ago'},
      {authorName: 'spankyed', hash: '77bb1e4', title: 'Align tasklist rows with renderer', time: '18m ago'},
      {authorName: 'spankyed', hash: '43d0ac9', title: 'Add Remotion app chrome primitives', time: '1h ago'},
    ],
    stashes: [],
    worktrees: [
      {branch: 'as/react-launch-film', path: '~/AgentBuddy', current: true},
      {branch: 'master', path: '~/AgentBuddy-master'},
    ],
    pullRequest: {
      baseBranch: 'master',
      body: [
        'Align launch film surfaces with the real app UI',
        'Add the publish branch and create PR views',
        'Keep flow blueprints status-free and source-backed',
      ].join('\n'),
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
      comments: [
        {
          authorName: 'spankyed',
          body: 'This is ready for review. The launch film now uses source-mirrored UI components instead of screenshot captures.',
          createdAt: 'just now',
          id: 'discussion-1',
          viewerDidAuthor: true,
        },
      ],
      checks: [
        'Preview build passed',
        'Release checks passed',
      ],
      createdPr: {
        authorName: 'spankyed',
        baseBranch: 'master',
        commitCount: 9,
        createdAt: 'just now',
        headBranch: 'as/react-launch-film',
        isDraft: false,
        mergeStateStatus: 'CLEAN',
        mergeable: 'MERGEABLE',
        number: 128,
        reviewDecision: 'APPROVED',
        state: 'OPEN',
        statusCheckRollup: [
          {conclusion: 'SUCCESS', name: 'Preview build', status: 'COMPLETED'},
          {conclusion: 'SUCCESS', name: 'Release checks', status: 'COMPLETED'},
        ],
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
      openPullRequests: [
        {number: 128, state: 'OPEN', title: 'React launch film'},
        {number: 124, state: 'OPEN', title: 'Improve launch film code surface'},
        {isDraft: true, number: 119, state: 'DRAFT', title: 'Flow blueprint polish'},
      ],
      reviewThreads: [
        {
          comments: [
            {
              authorName: 'reviewbot',
              body: 'Verified the PR panel keeps the same branch and action layout as the app.',
              createdAt: 'just now',
              id: 'review-comment-1',
            },
          ],
          diffLines: [
            {kind: 'meta', text: '@@ -24,7 +24,8 @@'},
            {kind: 'context', text: ' export function PullRequestPanel(props) {'},
            {kind: 'removed', text: '-  return <FakePrScaffold />;'},
            {kind: 'added', text: '+  return <PullRequestPanel state={state} />;'},
          ],
          id: 'review-thread-1',
          isResolved: false,
          location: 'Comment on line +25',
          path: 'packages/video/src/agentbuddy-ui/code/PullRequestPanel.tsx',
        },
      ],
      selectedCommentTab: 'discussion',
      title: 'React launch film',
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

export const expandedTerminalPanelState: TerminalPanelState = {
  ...codeShotState.review.terminal,
  expanded: true,
  output: [
    '$ npm run dev',
    '',
    '> agentbuddy-launch-film@0.1.0 dev',
    '> vite --host 127.0.0.1',
    '',
    'Local: http://127.0.0.1:5173',
    'rendered local app preview',
    'launch film preview ready',
  ].join('\n'),
};

export const sourceControlPanelReviewState: CodeReviewState = {
  ...codeShotState.review,
  worktrees: codeShotState.review.worktrees.slice(0, 1),
};

export function codeReviewViewForFrame(frame: number): CodeReviewViewState {
  const prPublishProgress = ease(frame, 318, 350);
  const prCreated = frame > 380;
  const prMerged = frame > 404;
  return {
    activePanel: frame < 48 || frame > 316 ? 'pr' : 'commit',
    commitButtonPressed: frame > 204 && frame <= 214,
    commitMenuActionPressed: frame > 128 && frame < 140,
    commitMenuOpen: frame > 112 && frame < 142,
    commitMessage: frame < 142 ? textReveal('incomplete work', frame, 56, 88) : frame > 184 ? codeShotState.generatedCommitMessage : '',
    diffLineOpacities: codeShotState.review.diff.lines.map((line, index) =>
      line.kind === 'context' ? 1 : ease(frame, 42 + index * 12, 60 + index * 12),
    ),
    generateCommitPressed: frame > 148 && frame <= 158,
    generatingCommitMessage: frame > 154 && frame <= 184,
    leftSurface: frame < 72 ? 'blank' : frame > 220 && frame < 258 ? 'terminal' : frame >= 258 && frame < 316 ? 'app-preview' : 'diff',
    prMode: frame <= 350 ? 'files' : frame <= 380 ? 'create' : 'details',
    prCreatePressed: frame > 368 && frame <= 380,
    prMergePressed: frame > 394 && frame <= 404,
    prPublishPressed: frame > 318 && frame <= 328,
    pullRequest: {
      ...codeShotState.review.pullRequest,
      branchPublished: prPublishProgress >= 1,
      createdPr: prCreated
        ? {
            ...codeShotState.review.pullRequest.createdPr!,
            state: prMerged ? 'MERGED' : codeShotState.review.pullRequest.createdPr!.state,
          }
        : undefined,
    },
    prPublishProgress,
    stageActionPressed: frame > 132 && frame <= 142,
  };
}

export function codeShotViewForFrame(frame: number): CodeShotView {
  const initialStaged = codeShotState.review.staged;
  const initialChanges = codeShotState.review.changes;
  const stashedInitialWork = frame >= 142;
  const stagedReviewedWork = frame >= 142 && frame < 214;
  const committedReviewedWork = frame >= 214;
  const checkedOutMainWorktree = frame >= 154;
  const reviewState: CodeReviewState = {
    ...codeShotState.review,
    branch: checkedOutMainWorktree ? 'master' : codeShotState.review.branch,
    changes: stagedReviewedWork || committedReviewedWork ? [] : initialChanges,
    commits: committedReviewedWork
      ? [
          {authorName: 'spankyed', hash: 'c0ffee1', title: codeShotState.generatedCommitMessage, time: 'just now'},
          ...codeShotState.review.commits,
        ]
      : codeShotState.review.commits,
    staged: stashedInitialWork
      ? stagedReviewedWork
        ? initialChanges
        : []
      : initialStaged,
    stashes: stashedInitialWork
      ? [
          {
            branch: 'as/react-launch-film',
            date: 'just now',
            message: 'WIP on as/react-launch-film: incomplete work',
            ref: 'stash@{0}',
          },
        ]
      : [],
    stashesExpanded: frame >= 142 && frame < 170,
    terminal: frame > 220 && frame < 316 ? expandedTerminalPanelState : codeShotState.review.terminal,
    worktrees: codeShotState.review.worktrees.map(worktree => ({
      ...worktree,
      current: checkedOutMainWorktree ? worktree.branch === 'master' : worktree.branch === 'as/react-launch-film',
      pressed: frame > 142 && frame < 154 && worktree.branch === 'master',
    })),
  };

  return {
    breadcrumbs: codeShotState.breadcrumbs,
    composer: launchComposerState,
    review: {
      state: reviewState,
      view: codeReviewViewForFrame(frame),
    },
  };
}
