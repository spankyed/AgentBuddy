export type ActionTemplate = {
  id: string;
  name: string;
  trigger: string;
  updatedAt: string;
};

export type ActionsSurfaceState = {
  activeActionId: string;
  actionCode: string;
  actions: ActionTemplate[];
  environment: Array<{key: string; value: string}>;
  runs: Array<{id: string; status: 'queued' | 'running' | 'success' | 'failed'; summary: string; time: string}>;
};
