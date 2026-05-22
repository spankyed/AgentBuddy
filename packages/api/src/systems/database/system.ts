import { setup } from 'xstate';
import { performance } from 'node:perf_hooks';
import { defineSystem } from '@/core/framework/define-system';
import { emit, getActor } from '@/core/shared/actor-helpers';
import { bus, brain } from '@/core/system-ids';
import type { DatabaseStartupData } from './types';
import { executeQuery } from './execute/query';
import { executeTransaction } from './execute/transaction';
import { generateSchemaInfo } from './repository/schema';
import { getTraceFlows, getFlowEvents, getNodeDetails } from './repository/trace-query';
import { exportDatabase, importDatabase, getBackupInfo } from './backup';
import { createLogger } from '@/core/shared/debug/logger';
import type { TNodeEntity } from '@/core/shared-types/brain';
import { resetLmdbFiles, clearMemory, envs, policy, persistence } from '@/core/ears/attribute-storage';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { repository } from '@/repository';

const logger = createLogger('database');

type IncomingDatabaseEvents =
  | { type: 'EXECUTE_QUERY'; code: string }
  | { type: 'EXECUTE_TRANSACTION'; code: string }
  | { type: 'GENERATE_AI_QUERY'; prompt: string; mode?: 'query' | 'transaction' }
  | { type: 'REFRESH_SCHEMA' }
  | { type: 'GET_TRACE_FLOWS' }
  | { type: 'GET_FLOW_EVENTS'; flowId: string; offset?: number; limit?: number }
  | { type: 'GET_NODE_DETAILS'; nodeId: string }
  | { type: 'EXPORT_DATABASE'; path: string; name?: string; databases: ('lmdb' | 'volatileLmdb' | 'secretsLmdb')[] }
  | { type: 'IMPORT_DATABASE'; path: string }
  | { type: 'GET_BACKUP_INFO'; path: string }
  | { type: 'RESET_DATABASE' };

type DatabaseInternalEvents =
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
  | { type: 'IMPORT_DATABASE_ERROR'; error: string }
  | { type: 'BACKUP_INFO_RESULT'; info: { timestamp: number; databases: string[]; size: number; hasMedia?: boolean } | null }
  | { type: 'RESET_DATABASE_SUCCESS'; message: string }
  | { type: 'RESET_DATABASE_ERROR'; error: string };

export interface DatabaseContext { }

export const databaseDef = defineSystem('database')<IncomingDatabaseEvents | DatabaseInternalEvents, OutgoingDatabaseEvents>();
export const database = databaseDef.id;

export const databaseSystem = setup({
  types: databaseDef.types,
  actions: {
    sendDatabaseRefresh: ({ system }) => {
      const schema = generateSchemaInfo();
      system.get(bus).send(emit(database, { 
        type: 'DATABASE_REFRESH',
        data: { schema }
      }));
    },
    executeQuery: async ({ system, event }) => {
      const { code } = databaseDef.typeOf('EXECUTE_QUERY', event);
      
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
      const { code } = databaseDef.typeOf('EXECUTE_TRANSACTION', event);
      
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
    handleAiQuery: ({ system, event }) => {
      const { prompt, mode } = databaseDef.typeOf('GENERATE_AI_QUERY', event);

      if (!prompt?.trim()) {
        logger.error('Invalid prompt provided for AI query generation');
        system.get(bus).send(emit(database, {
          type: 'QUERY_ERROR',
          error: 'Please provide a valid prompt'
        }));
        return;
      }

      getActor(system, brain).send({
        type: 'HANDLE_BRAIN_EVENT',
        eventType: 'db.query',
        payload: { prompt: prompt.trim(), mode: mode ?? 'query' },
      });
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
      const { flowId, offset = 0, limit = 50 } = databaseDef.typeOf('GET_FLOW_EVENTS', event);
      
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
      const { nodeId } = databaseDef.typeOf('GET_NODE_DETAILS', event);
      
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
      const { path, name, databases } = databaseDef.typeOf('EXPORT_DATABASE', event);
      
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
      const { path } = databaseDef.typeOf('IMPORT_DATABASE', event);
      
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
      const { path } = databaseDef.typeOf('GET_BACKUP_INFO', event);

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
    resetDatabase: async ({ system }) => {
      try {
        logger.info('Starting database reset...');

        // Delete and recreate all LMDB files
        await resetLmdbFiles();

        // Create new root flow
        const { flow, entryNode } = repository.flowsCommands.createFlowWithEntryNode({
          label: 'Root Flow',
          description: 'The root flow of the application',
        });
        repository.flowsCommands.grantRootFlowRole(flow.id);

        // Restart the brain with the new root flow
        getActor(system, brain).send({ type: 'RESTART_BRAIN' });

        logger.info('Database reset completed', { flowId: flow.id, entryNodeId: entryNode.id });

        // Send success response and refresh
        system.get(bus).send(emit(database, {
          type: 'RESET_DATABASE_SUCCESS',
          message: 'Database reset successfully. New root flow created.'
        }));

        system.get(bus).send(emit(database, {
          type: 'DATABASE_REFRESH',
          data: { schema: generateSchemaInfo() }
        }));
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Database reset failed:', { error: errorMessage });

        system.get(bus).send(emit(database, {
          type: 'RESET_DATABASE_ERROR',
          error: errorMessage
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
GENERATE_AI_QUERY: {
          actions: 'handleAiQuery',
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
        RESET_DATABASE: {
          actions: 'resetDatabase',
        },
      },
    },
  },
}); 