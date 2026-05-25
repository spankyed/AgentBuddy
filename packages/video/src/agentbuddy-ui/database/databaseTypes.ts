export type DatabaseSchemaItem = {
  description?: string;
  kind?: string;
  type?: string;
};

export type DatabaseSchema = {
  attributes: DatabaseSchemaItem[];
  entities: DatabaseSchemaItem[];
  relations: DatabaseSchemaItem[];
};

export type QueryExample = {
  description: string;
  query: string;
  title: string;
};

export type DatabaseResultRow = Record<string, unknown>;

export type DatabaseSurfaceState = {
  activeMode: 'query' | 'examples';
  aiPrompt?: string;
  currentQuery: string;
  error: string | null;
  executionTime: number | null;
  examples: QueryExample[];
  isAiPromptOpen: boolean;
  isAiQueryLoading: boolean;
  isLoading: boolean;
  mode: 'query' | 'transaction';
  queryResult: DatabaseResultRow[] | null;
  schema: DatabaseSchema;
  searchQuery: string;
  selectedSchemaItemId?: string;
  successMessage: string;
};
