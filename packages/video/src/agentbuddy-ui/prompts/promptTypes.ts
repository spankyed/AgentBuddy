export type PromptCategory = {
  name: string;
  color: string;
};

export type PromptInput = {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
};

export type PromptRow = {
  id: string;
  label: string;
  description?: string;
  category?: string;
  inputs: Record<string, PromptInput>;
  templateFn: string;
  outputSchema?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PromptsSurfaceState = {
  view: 'list' | 'detail';
  categories: PromptCategory[];
  selectedCategories: string[];
  prompts: PromptRow[];
  selectedPromptId?: string;
  loadingMore?: boolean;
};
