import type {GitFile} from './GitFileItem';

export type CommitLogEntryState = {
  hash: string;
  time: string;
  title: string;
};

export type WorktreeState = {
  branch: string;
  current?: boolean;
  path: string;
};

export type TerminalPanelState = {
  activeTerminalId?: string;
  expanded?: boolean;
  terminals: Array<{
    id: string;
    shell: string;
    title: string;
  }>;
};

export type PullRequestPanelState = {
  baseBranch: string;
  body: string;
  branchPublished: boolean;
  changedFiles: GitFile[];
  checks: string[];
  createdPr?: {
    number: number;
    state: 'OPEN' | 'DRAFT' | 'MERGED' | 'CLOSED';
    url: string;
  };
  fileTree: PullRequestFileTreeNode[];
  headBranch: string;
  title: string;
};

export type PullRequestFileTreeNode = {
  children?: PullRequestFileTreeNode[];
  count?: number;
  id: string;
  label: string;
  status?: GitFile['status'];
  type: 'folder' | 'file';
};

export type CodeReviewState = {
  branch: string;
  baseDirectory: string;
  changes: GitFile[];
  commits: CommitLogEntryState[];
  diff: {
    fileName: string;
    lineStart: number;
    lines: Array<{
      kind: 'add' | 'remove' | 'context';
      text: string;
    }>;
  };
  staged: GitFile[];
  pullRequest: PullRequestPanelState;
  terminal: TerminalPanelState;
  worktrees: WorktreeState[];
};

export type CodeReviewViewState = {
  activePanel: 'commit' | 'pr';
  commitMessage: string;
  diffLineOpacities: number[];
  generatingCommitMessage: boolean;
  prCreated: boolean;
  prCreating: boolean;
  prMode: 'files' | 'create' | 'details';
  prPublishProgress: number;
};
