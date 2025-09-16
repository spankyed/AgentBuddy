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
import { getTraceFlows, getFlowEvents, getNodeDetails } from './repository/trace-query';
import { exportDatabase, importDatabase, getBackupInfo } from './backup';
import { createLogger } from '@/core/utils/debug/logger';
import type { TNodeEntity } from '@/systems/brain/types';
import { clearMemory, envs, policy, persistence } from '@/core/ears/attribute-storage';
import { hydrateSharded } from '@/persistence/partitioning/hydrate-sharded';

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
  busEvent('GET_TRACE_FLOWS', {}),
  busEvent('GET_FLOW_EVENTS', { 
    flowId: z.string(), 
    offset: z.number().optional(),
    limit: z.number().optional()
  }),
  busEvent('GET_NODE_DETAILS', { 
    nodeId: z.string() 
  }),
  busEvent('EXPORT_DATABASE', {
    path: z.string(),
    name: z.string().optional(),
    databases: z.array(z.enum(['lmdb', 'searchIndices', 'volatileLmdb', 'secretsLmdb'])),
  }),
  busEvent('IMPORT_DATABASE', {
    path: z.string(),
  }),
  busEvent('GET_BACKUP_INFO', {
    path: z.string(),
  }),
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
  | { type: 'MAGIC_PROMPT_GENERATED'; query: string }
  | { type: 'TRACE_FLOWS_RESULT'; flows: TNodeEntity[] }
  | { type: 'FLOW_EVENTS_RESULT'; flowId: string; events: TNodeEntity[]; hasMore: boolean }
  | { type: 'NODE_DETAILS_RESULT'; nodeId: string; details: TNodeEntity | null }
  | { type: 'EXPORT_DATABASE_SUCCESS'; path: string }
  | { type: 'EXPORT_DATABASE_ERROR'; error: string }
  | { type: 'IMPORT_DATABASE_SUCCESS'; message?: string }
  | { type: 'IMPORT_DATABASE_ERROR'; error: string }
  | { type: 'BACKUP_INFO_RESULT'; info: { timestamp: number; databases: string[]; size: number } | null };

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
    getTraceFlows: ({ system }) => {
      try {
        const flows = getTraceFlows(100);
        logger.info('Retrieved trace flows', { count: flows.length });
        system.get(bus).send(emit(database, { 
          type: 'TRACE_FLOWS_RESULT',
          flows
        }));
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get trace flows:', { error: errorMessage });
        system.get(bus).send(emit(database, { 
          type: 'TRACE_FLOWS_RESULT',
          flows: []
        }));
      }
    },
    getFlowEvents: ({ system, event }) => {
      const { flowId, offset = 0, limit = 50 } = typeOf('GET_FLOW_EVENTS', event);
      
      try {
        const result = getFlowEvents(flowId, offset, limit);
        logger.info('Retrieved events for flow', { count: result.events.length, flowId });
        system.get(bus).send(emit(database, { 
          type: 'FLOW_EVENTS_RESULT',
          flowId,
          events: result.events,
          hasMore: result.hasMore
        }));
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get flow events:', { error: errorMessage, flowId });
        system.get(bus).send(emit(database, { 
          type: 'FLOW_EVENTS_RESULT',
          flowId,
          events: [],
          hasMore: false
        }));
      }
    },
    getNodeDetails: ({ system, event }) => {
      const { nodeId } = typeOf('GET_NODE_DETAILS', event);
      
      try {
        const details = getNodeDetails(nodeId);
        logger.info('Retrieved node details', { nodeId });
        system.get(bus).send(emit(database, { 
          type: 'NODE_DETAILS_RESULT',
          nodeId,
          details
        }));
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get node details:', { error: errorMessage, nodeId });
        system.get(bus).send(emit(database, { 
          type: 'NODE_DETAILS_RESULT',
          nodeId,
          details: null
        }));
      }
    },
    exportDatabase: ({ system, event }) => {
      const { path, name, databases } = typeOf('EXPORT_DATABASE', event);
      
      exportDatabase(path, name, databases).then(
        (resultPath) => {
          system.get(bus).send(emit(database, { 
            type: 'EXPORT_DATABASE_SUCCESS',
            path: resultPath
          }));
        },
        (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to export database:', { error: errorMessage });
          system.get(bus).send(emit(database, { 
            type: 'EXPORT_DATABASE_ERROR',
            error: errorMessage
          }));
        }
      );
    },
    importDatabase: ({ system, event }) => {
      const { path } = typeOf('IMPORT_DATABASE', event);
      
      importDatabase(path).then(
        async (result) => {
          // Clear memory and rehydrate from imported databases
          clearMemory();
          await hydrateSharded({ 
            envs, 
            policy,
            includeVolatile: result.databases.includes('volatileLmdb'),
            shardedPersistence: persistence
          });
          
          // Stop brain and notify success
          getActor(system, brain).send({ type: 'KILL_BRAIN' });
          system.get(bus).send(emit(database, { 
            type: 'IMPORT_DATABASE_SUCCESS',
            message: 'Import successful. Please restart the brain manually.'
          }));
          system.get(bus).send(emit(database, { 
            type: 'DATABASE_REFRESH',
            data: { schema: generateSchemaInfo() }
          }));
        },
        async (error: unknown) => {
          // Restore memory state
          clearMemory();
          await hydrateSharded({ envs, policy, shardedPersistence: persistence });
          
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to import database:', { error: errorMessage });
          system.get(bus).send(emit(database, { 
            type: 'IMPORT_DATABASE_ERROR',
            error: errorMessage
          }));
        }
      );
    },
    getBackupInfo: async ({ system, event }) => {
      const { path } = typeOf('GET_BACKUP_INFO', event);
      
      try {
        const info = await getBackupInfo(path);
        system.get(bus).send(emit(database, { 
          type: 'BACKUP_INFO_RESULT',
          info
        }));
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get backup info:', { error: errorMessage });
        system.get(bus).send(emit(database, { 
          type: 'BACKUP_INFO_RESULT',
          info: null
        }));
      }
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
        GET_TRACE_FLOWS: {
          actions: 'getTraceFlows',
        },
        GET_FLOW_EVENTS: {
          actions: 'getFlowEvents',
        },
        GET_NODE_DETAILS: {
          actions: 'getNodeDetails',
        },
        EXPORT_DATABASE: {
          actions: 'exportDatabase',
        },
        IMPORT_DATABASE: {
          actions: 'importDatabase',
        },
        GET_BACKUP_INFO: {
          actions: 'getBackupInfo',
        },
      },
    },
  },
}); 