import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import type {
  DatabaseQueryResult,
  DatabaseSchemaInfo,
  DatabaseStartupData,
  OutgoingDatabaseEvents,
  EARS,
} from '@abuddy/api'
import { trpc } from '@/core/trpc'

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'database'
export type DatabaseState = ActorRefFrom<typeof databaseState>

export interface DatabaseContext {
  schema: DatabaseSchemaInfo;
  currentQuery: string;
  queryResult: DatabaseQueryResult;
  isLoading: boolean;
  error: string | null;
  selectedSchemaItem: {
    type: 'entity' | 'attribute' | 'relation';
    value: string;
  } | null;
}

type SystemEvent = OutgoingDatabaseEvents

type UIEvent =
  | { type: 'QUERY.EXECUTE'; code: string }
  | { type: 'SCHEMA.SELECT'; itemType: 'entity' | 'attribute' | 'relation'; value: string }
  | { type: 'QUERY.UPDATE'; code: string }

export type DatabaseEvents = UIEvent | SystemEvent
const typeOf = safeEvents<DatabaseEvents>()

const generateQueryForSchemaItem = (type: 'entity' | 'attribute' | 'relation', value: string): string => {
  switch (type) {
    case 'entity':
      return `// Query all ${value} entities\nreturn qx(EARS.Entity.${value}).limit(20);`;
    case 'attribute':
      return `// Query entities with ${value} attribute\nreturn qx().where('${value}').limit(20);`;
    case 'relation':
      return `// Query ${value} relations
const allIds = getAllEntities();
const nodes = [];
const edges = [];
const nodeSet = new Set();

// Find all relations of type '${value}'
for (const sourceId of allIds) {
  const targets = qx(sourceId).related('${value}', sourceId, true).ids();
  
  if (targets.length > 0) {
    // Add source node if not already added
    if (!nodeSet.has(sourceId)) {
      nodeSet.add(sourceId);
      nodes.push({
        id: sourceId,
        type: sourceId.split('-')[0],
        data: getAll(sourceId)
      });
    }
    
    // Add target nodes and edges
    for (const targetId of targets) {
      if (!nodeSet.has(targetId)) {
        nodeSet.add(targetId);
        nodes.push({
          id: targetId,
          type: targetId.split('-')[0],
          data: getAll(targetId)
        });
      }
      
      edges.push({
        id: \`\${sourceId}-${value}-\${targetId}\`,
        source: sourceId,
        target: targetId,
        type: '${value}'
      });
    }
  }
}

return { nodes: nodes.slice(0, 50), edges: edges.slice(0, 100) };`;
  }
}

const databaseState = setup({
  types: {
    context: {} as DatabaseContext,
    events: {} as DatabaseEvents,
  },
  actions: {
    /* ── bootstrap ─────────────────────────────────────── */
    setStartupData: assign(({ event }) => {
      const ev = typeOf('DATABASE_STARTUP', event);
      return { 
        schema: ev.data.schema 
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

    updateQuery: assign(({ event }) => {
      const ev = typeOf('QUERY.UPDATE', event);
      return { currentQuery: ev.code };
    }),

    setQueryResult: assign(({ event }) => {
      const ev = typeOf('QUERY_RESULT', event);
      return {
        queryResult: ev.result,
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

    setLoading: assign({
      isLoading: true,
      error: null,
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
    currentQuery: `// Example queries - modify and run to explore the database

// Query all threads (limit 10)
return qx(EARS.Entity.Thread).limit(10);

// Or try these examples:
// return qx(EARS.Entity.Agent).where('status', 'active');
// return qx().where('label').limit(20);
// return qx(EARS.Entity.Flow).linksTo('contains', EARS.Entity.Node);`,
    queryResult: { nodes: [], edges: [] },
    isLoading: false,
    error: null,
    selectedSchemaItem: null,
  },
  on: {
    DATABASE_STARTUP: { actions: 'setStartupData' },
    QUERY_RESULT: { actions: 'setQueryResult' },
    QUERY_ERROR: { actions: 'setQueryError' },
  },
  states: {
    explorer: {
      tags: ['database-explorer'],
      meta: { ...breadcrumb('explorer', 'Database Explorer', true) },
      on: {
        'QUERY.EXECUTE': {
          actions: ['setLoading', 'executeQuery'],
        },
        'QUERY.UPDATE': {
          actions: 'updateQuery',
        },
        'SCHEMA.SELECT': {
          actions: 'selectSchemaItem',
        },
      },
    },
  },
})

export default databaseState 