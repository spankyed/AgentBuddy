import { sendToSystem, sendToPlugin } from '@/__generated__/events';
import { setup } from 'xstate';
import { performance } from 'node:perf_hooks';
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';
import { UnknownBackupDatabasesError } from '@abuddy/sdk/services';
import type { DatabaseStartupData } from './types';
import { executeQuery } from './execute/query';
import { executeTransaction } from './execute/transaction';
import { generateSchemaInfo } from './repository/schema';
import { getTraceFlows, getFlowEvents, getNodeDetails } from './repository/trace-query';
import { createLogger } from '@abuddy/sdk/logger';
import type { TNodeEntity } from '@abuddy/sdk/steps';
import { services } from '@/__generated__/services';
import { repository } from '@/__generated__/repository';
import { ref } from '@/__generated__/ref';

const logger = createLogger('database');

type IncomingDatabaseEvents =
  | { type: 'EXECUTE_QUERY'; code: string }
  | { type: 'EXECUTE_TRANSACTION'; code: string }
  | { type: 'GENERATE_AI_QUERY'; prompt: string; mode?: 'query' | 'transaction' }
  | { type: 'REFRESH_SCHEMA' }
  | { type: 'GET_TRACE_FLOWS' }
  | { type: 'GET_FLOW_EVENTS'; flowId: string; offset?: number; limit?: number }
  | { type: 'GET_NODE_DETAILS'; nodeId: string }
  | { type: 'EXPORT_DATABASE'; path: string; name?: string; databases: ('lmdb' | 'volatileLmdb')[] }
  | { type: 'IMPORT_DATABASE'; path: string; skipUnknownDatabases?: boolean }
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
  | { type: 'IMPORT_DATABASE_ERROR'; error: string; unknownDatabases?: string[] }
  | { type: 'BACKUP_INFO_RESULT'; info: { timestamp: number; databases: string[]; size: number; hasMedia?: boolean } | null }
  | { type: 'RESET_DATABASE_SUCCESS'; message: string }
  | { type: 'RESET_DATABASE_ERROR'; error: string };

export interface DatabaseContext { }

export const databaseSpec = defineSystem<IncomingDatabaseEvents | DatabaseInternalEvents, OutgoingDatabaseEvents>();

export const databaseSystem = setup({
  types: databaseSpec.types,
  actions: {
    sendDatabaseRefresh: ({ system }) => {
      const schema = generateSchemaInfo();
      sendToPlugin('database', { 
        type: 'DATABASE_REFRESH',
        data: { schema }
      });
    },
    executeQuery: async ({ system, event }) => {
      const { code } = databaseSpec.typeOf('EXECUTE_QUERY', event);
      
      try {
        const startTime = performance.now();
        const result = await executeQuery(code);
        const executionTime = performance.now() - startTime;
        
        sendToPlugin('database', { 
          type: 'QUERY_RESULT',
          result,
          executionTime
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Query execution failed:', { error: errorMessage });
        sendToPlugin('database', { 
          type: 'QUERY_ERROR',
          error: errorMessage
        });
      }
    },
    executeTransaction: async ({ system, event }) => {
      const { code } = databaseSpec.typeOf('EXECUTE_TRANSACTION', event);
      
      try {
        const startTime = performance.now();
        const result = await executeTransaction(code);
        const executionTime = performance.now() - startTime;
        
        sendToPlugin('database', { 
          type: 'TRANSACTION_RESULT',
          result,
          executionTime
        });
        
        // Send refresh event with updated schema
        logger.info('Transaction completed successfully, sending database refresh');
        const schema = generateSchemaInfo();
        sendToPlugin('database', { 
          type: 'DATABASE_REFRESH',
          data: { schema }
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Transaction execution failed:', { error: errorMessage });
        sendToPlugin('database', { 
          type: 'TRANSACTION_ERROR',
          error: errorMessage
        });
      }
    },
    handleAiQuery: ({ system, event }) => {
      const { prompt, mode } = databaseSpec.typeOf('GENERATE_AI_QUERY', event);

      if (!prompt?.trim()) {
        logger.error('Invalid prompt provided for AI query generation');
        sendToPlugin('database', {
          type: 'QUERY_ERROR',
          error: 'Please provide a valid prompt'
        });
        return;
      }

      const threadsSettings = repository.settingsQueries.getPluginSettings(ref('threads')) as any;
      const provider = threadsSettings?.chat?.defaultMode || 'Claude Code';

      sendToSystem('brain', {
        type: 'HANDLE_BRAIN_EVENT',
        eventType: 'db.query',
        payload: { prompt: prompt.trim(), mode: mode ?? 'query', provider },
      });
    },
    getTraceFlows: ({ system }) => {
      try {
        const flows = getTraceFlows(100);
        logger.info('Retrieved trace flows', { count: flows.length });
        sendToPlugin('database', { 
          type: 'TRACE_FLOWS_RESULT',
          flows
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get trace flows:', { error: errorMessage });
        sendToPlugin('database', { 
          type: 'TRACE_FLOWS_RESULT',
          flows: []
        });
      }
    },
    getFlowEvents: ({ system, event }) => {
      const { flowId, offset = 0, limit = 50 } = databaseSpec.typeOf('GET_FLOW_EVENTS', event);
      
      try {
        const result = getFlowEvents(flowId, offset, limit);
        logger.info('Retrieved events for flow', { count: result.events.length, flowId });
        sendToPlugin('database', { 
          type: 'FLOW_EVENTS_RESULT',
          flowId,
          events: result.events,
          hasMore: result.hasMore
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get flow events:', { error: errorMessage, flowId });
        sendToPlugin('database', { 
          type: 'FLOW_EVENTS_RESULT',
          flowId,
          events: [],
          hasMore: false
        });
      }
    },
    getNodeDetails: ({ system, event }) => {
      const { nodeId } = databaseSpec.typeOf('GET_NODE_DETAILS', event);
      
      try {
        const details = getNodeDetails(nodeId);
        logger.info('Retrieved node details', { nodeId });
        sendToPlugin('database', { 
          type: 'NODE_DETAILS_RESULT',
          nodeId,
          details
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get node details:', { error: errorMessage, nodeId });
        sendToPlugin('database', { 
          type: 'NODE_DETAILS_RESULT',
          nodeId,
          details: null
        });
      }
    },
    exportDatabase: ({ system, event }) => {
      const { path, name, databases } = databaseSpec.typeOf('EXPORT_DATABASE', event);
      
      services.appData.exportBackup(path, name, databases).then(
        (resultPath) => {
          sendToPlugin('database', { 
            type: 'EXPORT_DATABASE_SUCCESS',
            path: resultPath
          });
        },
        (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to export database:', { error: errorMessage });
          sendToPlugin('database', { 
            type: 'EXPORT_DATABASE_ERROR',
            error: errorMessage
          });
        }
      );
    },
    importDatabase: ({ system, event }) => {
      const { path, skipUnknownDatabases } = databaseSpec.typeOf('IMPORT_DATABASE', event);

      // Replaces stored data and reloads memory from it; on failure the previous data is restored and reloaded. The
      // settings come in with the rest, and the import's migrations write them: run through the settings' writer, it
      // tells the settings system a replacement is running, so nothing is told a change until it ends
      repository.settingsCommands.whileReplacingData(() => services.appData.importBackup(path, { skipUnknownDatabases })).then(
        ({ missingDatabases, unknownEntityTypes }) => {
          // Stop brain and notify success
          sendToSystem('brain', { type: 'KILL_BRAIN' });
          // A store the backup listed but didn't hold came back empty: said, not silently dropped
          const nothingToRestore = missingDatabases.length > 0
            ? ` The backup listed ${missingDatabases.join(', ')} but held nothing for it, so it is now empty.`
            : '';
          // Rows of a type no installed pack declares: kept, but nothing reads them until that pack is back
          const fromMissingPacks = unknownEntityTypes.length > 0
            ? ` It also holds ${unknownEntityTypes.map(([type, count]) => `${count} ${type}`).join(', ')} that no installed pack declares;`
              + ' those stay until the pack that declared them is installed again.'
            : '';
          sendToPlugin('database', {
            type: 'IMPORT_DATABASE_SUCCESS',
            message: `Import successful.${nothingToRestore}${fromMissingPacks} Please restart the brain manually.`
          });
          sendToPlugin('database', { 
            type: 'DATABASE_REFRESH',
            data: { schema: generateSchemaInfo() }
          });
        },
        (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to import database:', { error: errorMessage });
          sendToPlugin('database', {
            type: 'IMPORT_DATABASE_ERROR',
            error: errorMessage,
            // The user decides whether to import a newer AgentBuddy's backup without what this one can't hold
            ...(error instanceof UnknownBackupDatabasesError && { unknownDatabases: error.databases }),
          });
        }
      );
    },
    getBackupInfo: async ({ system, event }) => {
      const { path } = databaseSpec.typeOf('GET_BACKUP_INFO', event);

      try {
        const info = await services.appData.backupInfo(path);
        sendToPlugin('database', {
          type: 'BACKUP_INFO_RESULT',
          info
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get backup info:', { error: errorMessage });
        sendToPlugin('database', {
          type: 'BACKUP_INFO_RESULT',
          info: null
        });
      }
    },
    resetDatabase: async ({ system }) => {
      try {
        logger.info('Starting database reset...');

        // The host resets the whole app: fresh stores, then each pack's onInit and boot seed (the seeded root flow), then migrations
        await services.appData.reset();

        // Restart the brain with the new root flow
        sendToSystem('brain', { type: 'RESTART_BRAIN' });

        logger.info('Database reset completed', { flowId: repository.flowsQueries.rootFlow() });

        // Send success response and refresh
        sendToPlugin('database', {
          type: 'RESET_DATABASE_SUCCESS',
          message: 'Database reset successfully. New root flow created.'
        });

        sendToPlugin('database', {
          type: 'DATABASE_REFRESH',
          data: { schema: generateSchemaInfo() }
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Database reset failed:', { error: errorMessage });

        sendToPlugin('database', {
          type: 'RESET_DATABASE_ERROR',
          error: errorMessage
        });
      }
    },
  },
}).createMachine({
  id: 'database',
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

const databaseEntry = { spec: databaseSpec, machine: databaseSystem } satisfies SystemEntry;

export default databaseEntry;