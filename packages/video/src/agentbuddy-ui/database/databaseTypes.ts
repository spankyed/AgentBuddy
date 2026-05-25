export type DatabaseSchemaCategory = {
  color: 'blue' | 'green' | 'purple';
  count: number;
  expanded: boolean;
  id: 'entities' | 'attributes' | 'relations';
  items: Array<{id: string; label: string; selected?: boolean}>;
  label: string;
};

export type DatabaseResultRow = Record<string, string | number | boolean>;

export type DatabaseSurfaceState = {
  activeMode: 'query' | 'examples';
  aiPromptOpen?: boolean;
  executionTime: number | null;
  isLoading: boolean;
  mode: 'query' | 'transaction';
  query: string;
  resultHeaders: string[];
  resultRows: DatabaseResultRow[];
  schema: DatabaseSchemaCategory[];
  searchQuery: string;
  statusMessage?: string;
};
