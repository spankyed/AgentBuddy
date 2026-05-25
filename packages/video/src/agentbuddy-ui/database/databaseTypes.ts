export type DatabaseTableRow = {
  columns: string[];
  id: string;
  selected?: boolean;
};

export type DatabaseQuery = {
  elapsedMs: number;
  sql: string;
  status: 'idle' | 'running' | 'complete';
};

export type DatabaseSurfaceState = {
  activeTableId: string;
  connectionName: string;
  databases: Array<{
    id: string;
    label: string;
    tables: Array<{count: number; id: string; label: string}>;
  }>;
  detail: {
    fields: Array<{label: string; value: string}>;
    title: string;
  };
  query: DatabaseQuery;
  rows: DatabaseTableRow[];
  tableColumns: string[];
};
