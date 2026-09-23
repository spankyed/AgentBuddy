import type { TNodeEntity } from '@abuddy/sdk/steps';
import type { KeyboardShortcut } from '@abuddy/sdk/types';
import { EARS } from '@/__generated__/ears';

export interface DatabaseQueryResult {
  nodes: Array<{
    id: EARS.EntityId;
    type: EARS.Entity;
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: EARS.EntityId;
    target: EARS.EntityId;
    type: EARS.RelKind;
    data?: Record<string, unknown>;
  }>;
}

export interface DatabaseSchemaInfo {
  entities: Array<{
    type: EARS.Entity;
  }>;
  attributes: Array<{
    kind: string;
  }>;
  relations: Array<{
    kind: EARS.RelKind;
  }>;
}

export interface DatabaseStartupData {
  schema: DatabaseSchemaInfo;
}

// ── This feature's settings ───────────────────────────────────────────────
// Its own shape, which the app stores without knowing: the app owns the document, each feature its slice.
export interface DatabaseSettings {
  hotkeys: {
    executeQuery?: KeyboardShortcut;
  };
}

export type IncomingDatabaseEvents =
  | { type: 'EXECUTE_QUERY'; code: string }
  | { type: 'EXECUTE_TRANSACTION'; code: string }
  | { type: 'GENERATE_AI_QUERY'; prompt: string; mode?: 'query' | 'transaction' }
  | { type: 'REFRESH_SCHEMA' }
  | { type: 'GET_TRACE_FLOWS' }
  | { type: 'GET_FLOW_EVENTS'; flowId: string; offset?: number; limit?: number }
  | { type: 'GET_NODE_DETAILS'; nodeId: string }
  | { type: 'EXPORT_DATABASE'; path: string; name?: string; databases: ('lmdb' | 'volatileLmdb')[] }
  | { type: 'IMPORT_DATABASE'; path: string; skipUnknownDatabases?: boolean }
  | { type: 'GET_BACKUP_INFO'; path: string }
  | { type: 'RESET_DATABASE' };

export type DatabaseInternalEvents =
  | { type: 'CLIENT_CONNECTED' };

export type OutgoingDatabaseEvents = 
  | { type: 'DATABASE_REFRESH'; data: DatabaseStartupData }
  | { type: 'QUERY_RESULT'; result: any; executionTime: number }
  | { type: 'QUERY_ERROR'; error: string }
  | { type: 'TRANSACTION_RESULT'; result: any; executionTime: number }
  | { type: 'TRANSACTION_ERROR'; error: string }
  |{ type: 'AI_QUERY_LOADING' }
  | { type: 'AI_QUERY_GENERATED'; query: string }
  | { type: 'TRACE_FLOWS_RESULT'; flows: TNodeEntity[] }
  | { type: 'FLOW_EVENTS_RESULT'; flowId: string; events: TNodeEntity[]; hasMore: boolean }
  | { type: 'NODE_DETAILS_RESULT'; nodeId: string; details: TNodeEntity | null }
  | { type: 'EXPORT_DATABASE_SUCCESS'; path: string }
  | { type: 'EXPORT_DATABASE_ERROR'; error: string }
  | { type: 'IMPORT_DATABASE_SUCCESS'; message?: string }
  | { type: 'IMPORT_DATABASE_ERROR'; error: string; unknownDatabases?: string[] }
  | { type: 'BACKUP_INFO_RESULT'; info: { timestamp: number; databases: string[]; size: number; hasMedia?: boolean } | null }
  | { type: 'RESET_DATABASE_SUCCESS'; message: string }
  | { type: 'RESET_DATABASE_ERROR'; error: string };
