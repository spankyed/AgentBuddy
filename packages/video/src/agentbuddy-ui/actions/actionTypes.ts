export type ActionCategory = {
  color: string;
  name: string;
};

export type ActionRow = {
  category?: string;
  description?: string;
  id: string;
  inputs: string[];
  label: string;
};

export type ActionsSurfaceState = {
  actions: ActionRow[];
  categories: ActionCategory[];
  loadingMore?: boolean;
};
