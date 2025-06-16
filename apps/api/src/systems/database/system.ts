import { setup } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, safeEvents } from '@/shared/utils/actor-helpers';
import { EARS } from '@/shared/ears/types';
import { z } from 'zod';
import type { DatabaseQueryResult, DatabaseSchemaInfo, DatabaseStartupData } from './types';
import { executeQuery } from './query-executor';

export const database = 'database' as const;

const busEvent = systemBus(database);

export const IncomingDatabaseEvents = [
  busEvent('EXECUTE_QUERY', {
    code: z.string(),
  }),
] as const;

export type DatabaseInternalEvents = 
  | { type: 'CLIENT_CONNECTED' }
  | SystemEvents;

export type OutgoingDatabaseEvents = 
  | { type: 'DATABASE_STARTUP'; data: DatabaseStartupData }
  | { type: 'QUERY_RESULT'; result: DatabaseQueryResult; error?: string }
  | { type: 'QUERY_ERROR'; error: string };

export interface DatabaseContext {
  databaseId: EARS.EntityId;
}

export const DatabaseSystemEvents = fromSystem(IncomingDatabaseEvents)<OutgoingDatabaseEvents, typeof database>();
type ReceivableEvents = MergeReceivable<typeof IncomingDatabaseEvents, DatabaseInternalEvents>;
const typeOf = safeEvents<ReceivableEvents>();

// Generate schema information from the EARS types
function generateSchemaInfo(): DatabaseSchemaInfo {
  // Get all entity types from the enum
  const entities = Object.values(EARS.Entity).map(type => ({
    type,
  }));

  // Get common attributes from the code

  return { entities, attributes: [], relations: [] };
}

export const databaseSystem = setup({
  types: {
    context: {} as DatabaseContext,
    events: {} as ReceivableEvents,
    input: {} as EARS.EntityId,
  },
  actions: {
    sendDatabaseStartupData: ({ system }) => {
      const schema = generateSchemaInfo();
      system.get(bus).send(emit(database, { 
        type: 'DATABASE_STARTUP',
        data: { schema }
      }));
    },
    executeQuery: async ({ system, event }) => {
      const { code } = typeOf('EXECUTE_QUERY', event);
      
      try {
        const result = await executeQuery(code);
        system.get(bus).send(emit(database, { 
          type: 'QUERY_RESULT',
          result
        }));
      } catch (error) {
        system.get(bus).send(emit(database, { 
          type: 'QUERY_ERROR',
          error: error instanceof Error ? error.message : String(error)
        }));
      }
    },
  },
}).createMachine(
  {
    id: database,
    initial: 'idle',
    context: ({ input }) => ({
      databaseId: input,
    }),
    on: {
      CLIENT_CONNECTED: {
        actions: 'sendDatabaseStartupData',
      },
    },
    states: {
      idle: {
        on: {
          EXECUTE_QUERY: {
            actions: 'executeQuery',
          },
        },
      },
    },
  }
); 