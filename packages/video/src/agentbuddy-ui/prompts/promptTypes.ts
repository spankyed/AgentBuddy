export type PromptSurfaceState = {
  activePromptId: string;
  draft: string;
  prompts: Array<{id: string; model: string; title: string; updatedAt: string}>;
  testOutput: string[];
  variables: Array<{key: string; value: string}>;
};
