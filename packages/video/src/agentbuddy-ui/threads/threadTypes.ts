export type ToolActivityItemState = {
  durationMs?: number;
  outputSummary?: string;
  status: 'running' | 'ok' | 'denied' | 'error';
  summary: string;
  tool: string;
};

export type PlanArtifactState = {
  branch?: string;
  notes: string;
  prNumber?: string;
  status: 'draft' | 'approved' | 'in-progress' | 'completed';
  title: string;
};
