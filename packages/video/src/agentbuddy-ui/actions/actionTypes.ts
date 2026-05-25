export type ActionCategory = {
  color: string;
  name: string;
};

export type ActionRow = {
  actionFn?: string;
  category?: string;
  createdAt?: string;
  description?: string;
  id: string;
  inputParameters?: Record<string, ActionParameter>;
  inputs: string[];
  label: string;
  outputSchema?: string;
  updatedAt?: string;
};

export type ActionParameter = {
  description?: string;
  required?: boolean;
  type: string;
};

export type ActionsSurfaceState = {
  actions: ActionRow[];
  categories: ActionCategory[];
  loadingMore?: boolean;
  selectedActionId?: string;
  view: 'list' | 'detail';
};
