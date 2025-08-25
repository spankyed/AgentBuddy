import { assign, enqueueActions, setup, type ActorRefFrom } from 'xstate'
import breadcrumb from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import type {
  DatabaseSchemaInfo,
  DatabaseStartupData,
  OutgoingDatabaseEvents,
  EARS,
  TNodeEntity,
  DatabaseSettings,
} from '@app/api'
import { trpc } from '@/core/trpc'
import { attributeQueryTemplate, entityQueryTemplate, exampleQuery, relationQueryTemplate, transactionExampleQuery } from './constants'

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'database'
export type DatabaseState = ActorRefFrom<typeof databaseState>

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
  snapshotMessage: string | null;
  mode: 'query' | 'transaction';
  isMagicPromptLoading: boolean;
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
}

type SystemEvent = OutgoingDatabaseEvents | 
  { type: 'DATABASE_REFRESH'; data: DatabaseStartupData } |
  { type: 'TRANSACTION_RESULT'; result: any; executionTime: number } |
  { type: 'TRANSACTION_ERROR'; error: string } |
  { type: 'MAGIC_PROMPT_GENERATED'; query: string } |
  { type: 'DATABASE_SETTINGS_UPDATED'; settings: DatabaseSettings }

type UIEvent =
  | { type: 'QUERY.EXECUTE'; code: string }
  | { type: 'TRANSACTION.EXECUTE'; code: string }
  | { type: 'SCHEMA.SELECT'; itemType: 'entity' | 'attribute' | 'relation'; value: string }
  | { type: 'QUERY.UPDATE'; code: string }
  | { type: 'DATABASE.SAVE_SNAPSHOT' }
  | { type: 'DATABASE.REFRESH_SCHEMA' }
  | { type: 'MODE.TOGGLE' }
  | { type: 'MAGIC_PROMPT.GENERATE'; prompt: string }
  | { type: 'VIEW_MODE.TOGGLE' }
  | { type: 'TRACE.SELECT_FLOW'; flowId: string }
  | { type: 'TRACE.EXPAND_NODE'; nodeId: string }
  | { type: 'TRACE.LOAD_MORE' }
  | { type: 'TRACE.REQUEST_FLOWS' }
  | { type: 'ENTITY.DELETE'; entityId: string }

export type DatabaseEvents = UIEvent | SystemEvent
const typeOf = safeEvents<DatabaseEvents>()

const generateQueryForSchemaItem = (type: 'entity' | 'attribute' | 'relation', value: string): string => {
  switch (type) {
    case 'entity':
      return entityQueryTemplate(value);
    case 'attribute':
      return attributeQueryTemplate(value);
    case 'relation':
      return relationQueryTemplate(value);
  }
}

const databaseState = setup({
  types: {
    context: {} as DatabaseContext,
    events: {} as DatabaseEvents,
  },
  actions: {
    /* ── bootstrap ─────────────────────────────────────── */
    setDatabaseRefresh: assign(({ event }) => {
      const ev = typeOf('DATABASE_REFRESH', event);
      return {
        schema: ev.data.schema
      }
    }),

    /* ── settings ─────────────────────────────────────── */
    setDatabaseSettings: assign(({ event }) => {
      const ev = typeOf('DATABASE_SETTINGS_UPDATED', event);
      return {
        settings: ev.settings
      }
    }),

    /* ── query interactions ────────────────────────────── */
    executeQuery: ({ event, context }) => {
      const ev = typeOf('QUERY.EXECUTE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'EXECUTE_QUERY',
        code: ev.code,
      });
    },

    executeTransaction: ({ event, context }) => {
      const ev = typeOf('TRANSACTION.EXECUTE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'EXECUTE_TRANSACTION',
        code: ev.code,
      });
    },

    deleteEntity: ({ event, context }) => {
      const ev = typeOf('ENTITY.DELETE', event);
      // Use tx() to delete the entity
      const deleteCode = `tx('${ev.entityId}').destroy(); return { deleted: '${ev.entityId}' };`;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'EXECUTE_TRANSACTION',
        code: deleteCode,
      });
    },
    
    refreshAfterDelete: ({ context }) => {
      // Re-run the current query after successful deletion
      if (context.currentQuery) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'EXECUTE_QUERY',
          code: context.currentQuery,
        });
      }
    },

    updateQuery: assign(({ event }) => {
      const ev = typeOf('QUERY.UPDATE', event);
      return { currentQuery: ev.code };
    }),

    setQueryResult: assign(({ event }) => {
      const ev = typeOf('QUERY_RESULT', event);
      return {
        queryResult: ev.result,
        executionTime: ev.executionTime,
        isLoading: false,
        error: null,
      };
    }),

    setQueryError: assign(({ event }) => {
      const ev = typeOf('QUERY_ERROR', event);
      return {
        error: ev.error,
        isLoading: false,
      };
    }),

    setTransactionResult: enqueueActions(({ event, context, enqueue }) => {
      const ev = typeOf('TRANSACTION_RESULT', event);
      
      // Check if this was a delete operation
      if (ev.result && ev.result.deleted) {
        // After successful deletion, refresh the current query
        enqueue.assign({
          queryResult: ev.result,
          executionTime: ev.executionTime,
          isLoading: false,
          error: null,
        });
        enqueue('refreshAfterDelete');
      } else {
        // Regular transaction result
        enqueue.assign({
          queryResult: ev.result,
          executionTime: ev.executionTime,
          isLoading: false,
          error: null,
        });
      }
    }),

    setTransactionError: assign(({ event }) => {
      const ev = typeOf('TRANSACTION_ERROR', event);
      return {
        error: ev.error,
        isLoading: false,
      };
    }),

    toggleMode: assign(({ context }) => {
      const newMode: 'query' | 'transaction' = context.mode === 'query' ? 'transaction' : 'query';
      return {
        mode: newMode,
      };
    }),

    setLoading: assign({
      isLoading: true,
      error: null,
    }),

    saveSnapshot: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_SNAPSHOT',
        excludeTypes: ['TNode'], // Exclude temporary node entities
      });
    },

    setSnapshotSuccess: assign(({ event }) => {
      const ev = typeOf('SNAPSHOT_CREATED', event);
      return {
        snapshotMessage: `Snapshot saved: ${ev.filename}`,
        error: null,
      };
    }),

    setSnapshotError: assign(({ event }) => {
      const ev = typeOf('SNAPSHOT_ERROR', event);
      return {
        error: `Snapshot failed: ${ev.error}`,
        snapshotMessage: null,
      };
    }),

    clearSnapshotMessage: assign({
      snapshotMessage: null,
    }),

    /* ── magic prompt ───────────────────────────────── */
    generateMagicPrompt: ({ event }) => {
      const ev = typeOf('MAGIC_PROMPT.GENERATE', event);
      if (!ev.prompt?.trim()) {
        console.error('Invalid prompt provided for magic prompt generation');
        return;
      }
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GENERATE_MAGIC_PROMPT',
        prompt: ev.prompt.trim(),
      });
    },

    setMagicPromptLoading: assign({
      isMagicPromptLoading: true,
    }),

    setMagicPromptResult: assign(({ event }) => {
      const ev = typeOf('MAGIC_PROMPT_GENERATED', event);
      return {
        currentQuery: ev.query,
        isMagicPromptLoading: false,
      };
    }),


    /* ── schema interactions ───────────────────────────────── */
    selectSchemaItem: assign(({ event, context }) => {
      const ev = typeOf('SCHEMA.SELECT', event);
      const query = generateQueryForSchemaItem(ev.itemType, ev.value);

      return {
        selectedSchemaItem: {
          type: ev.itemType,
          value: ev.value,
        },
        currentQuery: query,
      };
    }),

    refreshSchema: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'REFRESH_SCHEMA',
      });
    },

    setRefreshing: assign({
      isRefreshing: true,
    }),

    setRefreshComplete: assign({
      isRefreshing: false,
    }),

    /* ── trace viewer actions ────────────────────────────── */
    toggleViewMode: assign(({ context }) => {
      const newMode = context.viewMode === 'database' ? 'trace' : 'database';
      if (newMode === 'trace' && context.traceFlows.length === 0) {
        // Request trace flows when switching to trace mode for the first time
        trpc.bus.send.mutate({
          systemId: id,
          type: 'GET_TRACE_FLOWS',
        });
      }
      return {
        viewMode: newMode,
        isLoadingTrace: newMode === 'trace' && context.traceFlows.length === 0,
      };
    }),

    requestTraceFlows: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GET_TRACE_FLOWS',
      });
    },

    setTraceFlows: assign(({ event }) => {
      const ev = typeOf('TRACE_FLOWS_RESULT', event);
      
      // Sort flows to ensure TNode-Root is always at the top
      const sortedFlows = [...ev.flows].sort((a, b) => {
        // Check if either flow is the root (TNode-Root or Run Agent Brain)
        const aIsRoot = a.id === 'TNode-Root' || a.label === 'Run Agent Brain';
        const bIsRoot = b.id === 'TNode-Root' || b.label === 'Run Agent Brain';
        
        // If one is root and the other isn't, root comes first
        if (aIsRoot && !bIsRoot) return -1;
        if (!aIsRoot && bIsRoot) return 1;
        
        // Otherwise maintain original order (already sorted by backend)
        return 0;
      });
      
      // Auto-select first flow if we have flows and no current selection
      if (sortedFlows.length > 0) {
        const firstFlow = sortedFlows[0];
        trpc.bus.send.mutate({
          systemId: id,
          type: 'GET_FLOW_EVENTS',
          flowId: firstFlow.id,
          offset: 0,
          limit: 50,
        });
        
        return {
          traceFlows: sortedFlows,
          currentFlowId: firstFlow.id,
          isLoadingTrace: true, // Still loading events for the selected flow
        };
      }
      
      return {
        traceFlows: sortedFlows,
        isLoadingTrace: false,
      };
    }),

    selectFlow: assign(({ event }) => {
      const ev = typeOf('TRACE.SELECT_FLOW', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GET_FLOW_EVENTS',
        flowId: ev.flowId,
        offset: 0,
        limit: 50,
      });
      return {
        currentFlowId: ev.flowId,
        flowEvents: [],
        tracePagination: {
          offset: 0,
          limit: 50,
          hasMore: false,
        },
        isLoadingTrace: true,
      };
    }),

    setFlowEvents: assign(({ event, context }) => {
      const ev = typeOf('FLOW_EVENTS_RESULT', event);
      return {
        flowEvents: context.tracePagination.offset > 0 
          ? [...context.flowEvents, ...ev.events]
          : ev.events,
        tracePagination: {
          ...context.tracePagination,
          hasMore: ev.hasMore,
        },
        isLoadingTrace: false,
      };
    }),

    loadMoreEvents: enqueueActions(({ context, enqueue }) => {
      if (!context.currentFlowId || !context.tracePagination.hasMore) return;
      
      const newOffset = context.tracePagination.offset + context.tracePagination.limit;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GET_FLOW_EVENTS',
        flowId: context.currentFlowId,
        offset: newOffset,
        limit: context.tracePagination.limit,
      });
      enqueue.assign({
        tracePagination: {
          ...context.tracePagination,
          offset: newOffset,
        },
        isLoadingTrace: true,
      });
    }),

    expandNode: enqueueActions(({ event, context, enqueue }) => {
      const ev = typeOf('TRACE.EXPAND_NODE', event);
      const newExpanded = new Set(context.expandedNodes);
      
      if (newExpanded.has(ev.nodeId)) {
        newExpanded.delete(ev.nodeId);
      } else {
        newExpanded.add(ev.nodeId);
        // Request node details if not already loaded
        if (!context.nodeDetails.has(ev.nodeId)) {
          trpc.bus.send.mutate({
            systemId: id,
            type: 'GET_NODE_DETAILS',
            nodeId: ev.nodeId,
          });
        }
      }
      
      enqueue.assign({
        expandedNodes: newExpanded,
      });
    }),

    setNodeDetails: assign(({ event, context }) => {
      const ev = typeOf('NODE_DETAILS_RESULT', event);
      if (ev.details) {
        const newDetails = new Map(context.nodeDetails);
        newDetails.set(ev.nodeId, ev.details);
        return {
          nodeDetails: newDetails,
        };
      }
      return {};
    }),
  },
}).createMachine({
  id,
  initial: 'explorer',
  context: {
    schema: {
      entities: [],
      attributes: [],
      relations: [],
    },
    currentQuery: exampleQuery,
    queryResult: null,
    isLoading: false,
    error: null,
    executionTime: null,
    selectedSchemaItem: null,
    snapshotMessage: null,
    mode: 'query',
    isMagicPromptLoading: false,
    isRefreshing: false,
    settings: null,
    // Trace viewer fields
    viewMode: 'database',
    traceFlows: [],
    currentFlowId: null,
    flowEvents: [],
    expandedNodes: new Set(),
    nodeDetails: new Map(),
    isLoadingTrace: false,
    tracePagination: {
      offset: 0,
      limit: 50,
      hasMore: false,
    },
  },
  on: {
    DATABASE_REFRESH: { actions: ['setDatabaseRefresh', 'setRefreshComplete'] },
    QUERY_RESULT: { actions: 'setQueryResult' },
    QUERY_ERROR: { actions: 'setQueryError' },
    TRANSACTION_RESULT: { actions: 'setTransactionResult' },
    TRANSACTION_ERROR: { actions: 'setTransactionError' },
    SNAPSHOT_CREATED: { actions: 'setSnapshotSuccess' },
    SNAPSHOT_ERROR: { actions: 'setSnapshotError' },
    MAGIC_PROMPT_GENERATED: { actions: 'setMagicPromptResult' },
    DATABASE_SETTINGS_UPDATED: { actions: 'setDatabaseSettings' },
    // Trace viewer events
    TRACE_FLOWS_RESULT: { actions: 'setTraceFlows' },
    FLOW_EVENTS_RESULT: { actions: 'setFlowEvents' },
    NODE_DETAILS_RESULT: { actions: 'setNodeDetails' },
  },
  states: {
    explorer: {
      tags: ['database-explorer'],
      meta: { ...breadcrumb('explorer', 'Database Explorer', true) },
      on: {
        'QUERY.EXECUTE': {
          actions: ['setLoading', 'executeQuery'],
        },
        'TRANSACTION.EXECUTE': {
          actions: ['setLoading', 'executeTransaction'],
        },
        'ENTITY.DELETE': {
          actions: ['setLoading', 'deleteEntity'],
        },
        'QUERY.UPDATE': {
          actions: 'updateQuery',
        },
        'MODE.TOGGLE': {
          actions: 'toggleMode',
        },
        'SCHEMA.SELECT': {
          actions: 'selectSchemaItem',
        },
        'DATABASE.SAVE_SNAPSHOT': {
          actions: 'saveSnapshot',
        },
        'MAGIC_PROMPT.GENERATE': {
          actions: ['setMagicPromptLoading', 'generateMagicPrompt'],
        },
        'DATABASE.REFRESH_SCHEMA': {
          actions: ['setRefreshing', 'refreshSchema'],
        },
        'VIEW_MODE.TOGGLE': {
          actions: ['toggleViewMode', 'requestTraceFlows'],
        },
        'TRACE.SELECT_FLOW': {
          actions: 'selectFlow',
        },
        'TRACE.EXPAND_NODE': {
          actions: 'expandNode',
        },
        'TRACE.LOAD_MORE': {
          actions: 'loadMoreEvents',
        },
        'TRACE.REQUEST_FLOWS': {
          actions: 'requestTraceFlows',
        },
      },
    },
  },
})

export default databaseState 