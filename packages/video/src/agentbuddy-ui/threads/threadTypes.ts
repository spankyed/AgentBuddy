export type ToolActivityItemState = {
  status: 'active' | 'done' | 'queued';
  title: string;
};

export type PlanArtifactState = {
  notes: string[];
  status: 'draft' | 'approved' | 'in-progress' | 'completed';
  title: string;
};

