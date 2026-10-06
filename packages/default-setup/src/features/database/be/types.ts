import type { TNodeEntity } from '@abuddy/sdk/steps';
import type { KeyboardShortcut } from '@abuddy/sdk/types';
import { EARS } from '#generated/ears.ts';

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
  | { type: 'EXECUTE_QUERY'; code: string; requestId: string }
  | { type: 'EXECUTE_TRANSACTION'; code: string; requestId: string }
  | { type: 'GENERATE_AI_QUERY'; prompt: string; mode?: 'query' | 'transaction' }
  | { type: 'REFRESH_SCHEMA' }
  | { type: 'GET_TRACE_FLOWS' }
  | { type: 'GET_FLOW_EVENTS'; flowId: string; offset?: number; limit?: number }
  | { type: 'GET_NODE_DETAILS'; nodeId: string }
  | { type: 'EXPORT_DATABASE'; path: string; name?: string; databases: ('lmdb' | 'volatileLmdb')[] }
  | { type: 'IMPORT_DATABASE'; path: string; skipUnknownDatabases?: boolean }
  | { type: 'GET_BACKUP_INFO'; path: string }
  | { type: 'RESET_DATABASE' };

export type OutgoingDatabaseEvents = 
  | { type: 'DATABASE_REFRESH'; data: DatabaseStartupData }
  /**
   * The four replies to `EXECUTE_QUERY`/`EXECUTE_TRANSACTION`, each naming the request it answers.
   *
   * **The id is the requester's, not a sequence number.** Whoever sends the request mints it, so a reply
   * identifies *that* request rather than saying which emit was most recent — the difference matters for
   * the case this exists for: a requester that gave up waiting and asked again. A counter stamped at emit
   * time gives the abandoned request's late reply the highest id, so it wins.
   *
   * It also has to be unique across windows, because `broadcastToPlugin` reaches every one of them, so a
   * per-window counter would collide. `randomId` (`@abuddy/sdk/utils/pure`) is what the senders use.
   */
  | { type: 'QUERY_RESULT'; result: any; executionTime: number; requestId: string }
  | { type: 'QUERY_ERROR'; error: string; requestId: string }
  | { type: 'TRANSACTION_RESULT'; result: any; executionTime: number; requestId: string }
  | { type: 'TRANSACTION_ERROR'; error: string; requestId: string }
  |{ type: 'AI_QUERY_LOADING' }
  | { type: 'AI_QUERY_GENERATED'; query: string }
  /**
   * Generating a query from a prompt failed, which is not a query failing.
   *
   * Its own event because it answers no `EXECUTE_QUERY` and so can carry no `requestId`. It used to be a
   * `QUERY_ERROR`, which made that event mean two things — and once a consumer ignores a `QUERY_ERROR`
   * whose id is not the one it is waiting for, an AI failure sent as one is silently swallowed and the
   * plugin's loading flag never clears.
   */
  | { type: 'AI_QUERY_ERROR'; error: string }
  | { type: 'TRACE_FLOWS_RESULT'; flows: TNodeEntity[] }
  /**
   * `offset` is which page these events are, which is what tells two pages of one flow apart — the flow id
   * alone cannot, so a viewer correlating on it places a late page by wherever it has since got to.
   */
  | { type: 'FLOW_EVENTS_RESULT'; flowId: string; events: TNodeEntity[]; hasMore: boolean; offset: number }
  | { type: 'NODE_DETAILS_RESULT'; nodeId: string; details: TNodeEntity | null }
  | { type: 'EXPORT_DATABASE_SUCCESS'; path: string }
  | { type: 'EXPORT_DATABASE_ERROR'; error: string }
  | { type: 'IMPORT_DATABASE_SUCCESS'; message?: string }
  | { type: 'IMPORT_DATABASE_ERROR'; error: string; unknownDatabases?: string[] }
  | { type: 'BACKUP_INFO_RESULT'; info: { timestamp: number; databases: string[]; size: number; hasMedia?: boolean } | null }
  | { type: 'RESET_DATABASE_SUCCESS'; message: string }
  | { type: 'RESET_DATABASE_ERROR'; error: string };
