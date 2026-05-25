export type BrainSurfaceState = {
  activeMemoryId: string;
  memories: Array<{id: string; label: string; kind: 'note' | 'thread' | 'code' | 'workflow'; strength: number}>;
  selectedMemory: {
    facts: string[];
    title: string;
  };
  traces: Array<{id: string; summary: string; time: string; tokens: string}>;
};
