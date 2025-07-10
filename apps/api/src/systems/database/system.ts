import { setup } from 'xstate';
import { z } from 'zod';
import { performance } from 'node:perf_hooks';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { emit, safeEvents } from '@/shared/utils/actor-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { EARS } from '@/shared/ears/types';
import { getAllAttributeKinds, getAllRelationKinds } from '@/shared/ears/attribute-storage';
import type { DatabaseSchemaInfo, DatabaseStartupData } from './types';
import { executeQuery } from './execute/query';
import { createLogger } from '@/shared/debug/logger';

const logger = createLogger('database');

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
  | { type: 'QUERY_RESULT'; result: any; executionTime: number }
  | { type: 'QUERY_ERROR'; error: string };

export interface DatabaseContext {
  databaseId: EARS.EntityId;
}

export const DatabaseSystemEvents = fromSystem(IncomingDatabaseEvents)<OutgoingDatabaseEvents, typeof database>();
type ReceivableEvents = MergeReceivable<typeof IncomingDatabaseEvents, DatabaseInternalEvents>;
const typeOf = safeEvents<ReceivableEvents>();

function generateSchemaInfo(): DatabaseSchemaInfo {
  const entities = Object.values(EARS.Entity).map(type => ({ type }));
  
  const attributes = getAllAttributeKinds().map(kind => ({
    kind: typeof kind === 'string' ? kind : String(kind),
  }));
  
  const relations = getAllRelationKinds().map(kind => ({
    kind: kind as EARS.RelKind,
  }));

  return { entities, attributes, relations };
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
        const startTime = performance.now();
        const result = await executeQuery(code);
        const executionTime = performance.now() - startTime;
        
        system.get(bus).send(emit(database, { 
          type: 'QUERY_RESULT',
          result,
          executionTime
        }));
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Query execution failed:', { error: errorMessage });
        system.get(bus).send(emit(database, { 
          type: 'QUERY_ERROR',
          error: errorMessage
        }));
      }
    },
  },
}).createMachine({
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
}); 