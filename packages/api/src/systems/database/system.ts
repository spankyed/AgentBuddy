import { setup } from 'xstate';
import { z } from 'zod';
import { performance } from 'node:perf_hooks';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { emit, safeEvents, getActor } from '@/core/utils/actor-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { brain } from '@/systems/brain/system';
import { EARS } from '@/core/types';
import { createSnapshot } from './snapshot';
import type { DatabaseStartupData } from './types';
import { executeQuery } from './execute/query';
import { executeTransaction } from './execute/transaction';
import { generateSchemaInfo } from './repository/schema';
import { createLogger } from '@/core/utils/debug/logger';

const logger = createLogger('database');

export const database = 'database' as const;

const busEvent = systemBus(database);

export const IncomingDatabaseEvents = [
  busEvent('EXECUTE_QUERY', {
    code: z.string(),
  }),
  busEvent('EXECUTE_TRANSACTION', {
    code: z.string(),
  }),
  busEvent('CREATE_SNAPSHOT', {
    name: z.string().optional(),
    excludeTypes: z.array(z.string()).optional(),
  }),
  busEvent('GENERATE_MAGIC_PROMPT', {
    prompt: z.string(),
  }),
  busEvent('REFRESH_SCHEMA', {}),
] as const;

export type DatabaseInternalEvents = 
  | { type: 'CLIENT_CONNECTED' }
  | SystemEvents;

export type OutgoingDatabaseEvents = 
  | { type: 'DATABASE_REFRESH'; data: DatabaseStartupData }
  | { type: 'QUERY_RESULT'; result: any; executionTime: number }
  | { type: 'QUERY_ERROR'; error: string }
  | { type: 'TRANSACTION_RESULT'; result: any; executionTime: number }
  | { type: 'TRANSACTION_ERROR'; error: string }
  | { type: 'SNAPSHOT_CREATED'; filename: string }
  | { type: 'SNAPSHOT_ERROR'; error: string }
  | { type: 'MAGIC_PROMPT_GENERATED'; query: string };

export interface DatabaseContext { }

export const DatabaseSystemEvents = fromSystem(IncomingDatabaseEvents)<OutgoingDatabaseEvents, typeof database>();
type ReceivableEvents = MergeReceivable<typeof IncomingDatabaseEvents, DatabaseInternalEvents>;
const typeOf = safeEvents<ReceivableEvents>();

export const databaseSystem = setup({
  types: {
    context: {} as DatabaseContext,
    events: {} as ReceivableEvents,
  },
  actions: {
    sendDatabaseRefresh: ({ system }) => {
      const schema = generateSchemaInfo();
      system.get(bus).send(emit(database, { 
        type: 'DATABASE_REFRESH',
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
    executeTransaction: async ({ system, event }) => {
      const { code } = typeOf('EXECUTE_TRANSACTION', event);
      
      try {
        const startTime = performance.now();
        const result = await executeTransaction(code);
        const executionTime = performance.now() - startTime;
        
        system.get(bus).send(emit(database, { 
          type: 'TRANSACTION_RESULT',
          result,
          executionTime
        }));
        
        // Send refresh event with updated schema
        logger.info('Transaction completed successfully, sending database refresh');
        const schema = generateSchemaInfo();
        system.get(bus).send(emit(database, { 
          type: 'DATABASE_REFRESH',
          data: { schema }
        }));
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Transaction execution failed:', { error: errorMessage });
        system.get(bus).send(emit(database, { 
          type: 'TRANSACTION_ERROR',
          error: errorMessage
        }));
      }
    },
    createSnapshot: async ({ system, event }) => {
      const { name, excludeTypes } = typeOf('CREATE_SNAPSHOT', event);
      
      try {
        const filename = await createSnapshot(name, excludeTypes as EARS.Entity[] | undefined);
        logger.info(`Snapshot created: ${filename}${
          excludeTypes?.length ? ` (excluded: ${excludeTypes.join(', ')})` : ''
        }`);
        system.get(bus).send(emit(database, { 
          type: 'SNAPSHOT_CREATED',
          filename
        }));
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Snapshot creation failed:', { error: errorMessage });
        system.get(bus).send(emit(database, { 
          type: 'SNAPSHOT_ERROR',
          error: errorMessage
        }));
      }
    },
    handleMagicPrompt: ({ system, event }) => {
      const { prompt } = typeOf('GENERATE_MAGIC_PROMPT', event);
      
      if (!prompt?.trim()) {
        logger.error('Invalid prompt provided for magic prompt generation');
        system.get(bus).send(emit(database, { 
          type: 'QUERY_ERROR',
          error: 'Please provide a valid prompt'
        }));
        return;
      }
      
      const brainActor = getActor(system, brain);
      brainActor.send({
        type: 'TRIGGER_BRAIN_EVENT',
        eventType: 'database.query.prompt',
        payload: prompt.trim(),
      });
      
      logger.info('Sent magic prompt to brain:', { prompt: prompt.trim() });
    },
  },
}).createMachine({
  id: database,
  initial: 'idle',
  context: ({ input }) => ({}),
  on: {
    CLIENT_CONNECTED: {
      actions: 'sendDatabaseRefresh',
    },
  },
  states: {
    idle: {
      on: {
        EXECUTE_QUERY: {
          actions: 'executeQuery',
        },
        EXECUTE_TRANSACTION: {
          actions: 'executeTransaction',
        },
        CREATE_SNAPSHOT: {
          actions: 'createSnapshot',
        },
        GENERATE_MAGIC_PROMPT: {
          actions: 'handleMagicPrompt',
        },
        REFRESH_SCHEMA: {
          actions: 'sendDatabaseRefresh',
        },
      },
    },
  },
}); 