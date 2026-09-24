// The database plugin's contract: the state it publishes and what other plugins may send it.
//
// A leaf: no machine, no other feature, and nothing from `#generated/*` but `types` and `ears` — which is what lets
// codegen read the contract without resolving the machine, whose imports cycle back through `#generated/events`.
// `abuddy.json` names it at `features[].plugin.contract`.
import type { PluginInbox } from '@abuddy/sdk/fe'
import type { TNodeEntity } from '@abuddy/sdk'
import type { DatabaseSettings } from '@/__generated__/types'
import type { DatabaseSchemaInfo } from '../be/types'

export interface DatabaseContext {
  schema: DatabaseSchemaInfo;
  currentQuery: string;
  queryResult: any;
  isLoading: boolean;
  error: string | null;
  executionTime: number | null;
  selectedSchemaItem: {
    type: 'entity' | 'attribute' | 'relation';
    value: string;
  } | null;
  mode: 'query' | 'transaction';
  isAiQueryLoading: boolean;
  isRefreshing: boolean;
  settings: DatabaseSettings | null;
  // Trace viewer fields
  viewMode: 'database' | 'trace';
  traceFlows: TNodeEntity[];
  currentFlowId: string | null;
  flowEvents: TNodeEntity[];
  expandedNodes: Set<string>;
  nodeDetails: Map<string, TNodeEntity>;
  isLoadingTrace: boolean;
  tracePagination: {
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  // Backup fields
  backupInfo: { timestamp: number; databases: string[]; size: number; hasMedia?: boolean } | null;
  exporting: boolean;
  importing: boolean;
  /** The last export or import to finish, a new object each time */
  backupResult: {
    operation: 'export' | 'import';
    error?: string;
    /** The backup holds these stores, which this AgentBuddy doesn't have: importing it leaves them out */
    unknownDatabases?: string[];
  } | null;
}

/**
 * The page the Database settings open. Spelled out rather than extracted from the machine's union: the contract is
 * read from this module alone, and an `Extract<>` over `./state` would pull the machine back in. The extracted form
 * also named `VIEW_DASHBOARD`, which that union never had, so it silently declared one event where it meant two.
 */
export type DatabaseInboxEvent = { type: 'VIEW_BACKUP' }

export type Contract = {
  state: DatabaseContext
  inbox: PluginInbox<{ pack: DatabaseInboxEvent }>
}
