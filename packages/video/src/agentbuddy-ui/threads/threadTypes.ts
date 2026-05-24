export type ToolActivityItemState = {
  durationMs?: number;
  id: string;
  outputSummary?: string;
  status: 'running' | 'ok' | 'denied' | 'error';
  summary: string;
  tool: string;
};

export type ToolActivityBlockState = {
  artifactRef?: {
    artifactId: string;
    label: string;
  };
  defaultOpen?: boolean;
  entries: ToolActivityItemState[];
  label?: string;
  phase?: string;
  state: 'streaming' | 'done' | 'error';
};

export type PlanArtifactState = {
  content: {
    branch?: string;
    notes: string;
    prNumber?: string;
    status: 'draft' | 'approved' | 'in-progress' | 'completed' | 'rejected';
    steps?: Array<{
      description?: string;
      id: string;
      status: string;
      title: string;
    }>;
  };
  id: string;
  title: string;
};

export type ThreadsHeaderState = {
  activeFilterCount?: number;
  activeView?: 'list' | 'kanban' | 'dashboard';
  filterLabel: string;
  newThreadLabel: string;
  searchPlaceholder: string;
  subtitle: string;
};
