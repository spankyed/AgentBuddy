import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import type {
  DatabaseSchemaInfo,
  DatabaseStartupData,
  OutgoingDatabaseEvents,
  EARS,
} from '@abuddy/api'
import { trpc } from '@/core/trpc'
import { attributeQueryTemplate, entityQueryTemplate, exampleQuery, relationQueryTemplate } from './constants'

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
}

type SystemEvent = OutgoingDatabaseEvents

type UIEvent =
  | { type: 'QUERY.EXECUTE'; code: string }
  | { type: 'SCHEMA.SELECT'; itemType: 'entity' | 'attribute' | 'relation'; value: string }
  | { type: 'QUERY.UPDATE'; code: string }
  | { type: 'DATABASE.SAVE_SNAPSHOT' }

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
    currentQuery: exampleQuery,
    queryResult: null,
    isLoading: false,
    error: null,
    executionTime: null,
    selectedSchemaItem: null,
    snapshotMessage: null,
  },
  on: {
    DATABASE_STARTUP: { actions: 'setStartupData' },
    QUERY_RESULT: { actions: 'setQueryResult' },
    QUERY_ERROR: { actions: 'setQueryError' },
    SNAPSHOT_CREATED: { actions: 'setSnapshotSuccess' },
    SNAPSHOT_ERROR: { actions: 'setSnapshotError' },
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
        'DATABASE.SAVE_SNAPSHOT': {
          actions: 'saveSnapshot',
        },
      },
    },
  },
})

export default databaseState 