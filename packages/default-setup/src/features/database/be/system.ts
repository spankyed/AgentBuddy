import type { ThreadsSettings } from '@/__generated__/types';
import { sendToSystem, broadcastToPlugin } from '@/__generated__/events';
import { setup } from 'xstate';
import { performance } from 'node:perf_hooks';
import { defineSystem } from '@abuddy/sdk/framework';
import { UnknownBackupDatabasesError } from '@abuddy/sdk/services';
import type { Contract } from './contract';
import { executeQuery } from './execute/query';
import { executeTransaction } from './execute/transaction';
import { generateSchemaInfo } from './repository/schema';
import { getTraceFlows, getFlowEvents, getNodeDetails } from './repository/trace-query';
import { createLogger } from '@abuddy/sdk/logger';
import { services } from '@/__generated__/services';
import { repository } from '@/__generated__/repository';
import { ref } from '@/__generated__/ref';
import { errorMessage } from '@abuddy/sdk/utils/pure';

const logger = createLogger('database');

export interface DatabaseContext { }

export const databaseSpec = defineSystem<Contract>();

export const databaseSystem = setup({
  types: databaseSpec.types,
  actions: {
    sendDatabaseRefresh: ({ system }) => {
      const schema = generateSchemaInfo();
      broadcastToPlugin('database', { 
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
        
        broadcastToPlugin('database', { 
          type: 'QUERY_RESULT',
          result,
          executionTime
        });
      } catch (error: unknown) {
        logger.error('Query execution failed:', { error: errorMessage(error) });
        broadcastToPlugin('database', { 
          type: 'QUERY_ERROR',
          error: errorMessage(error)
        });
      }
    },
    executeTransaction: async ({ system, event }) => {
      const { code } = databaseSpec.typeOf('EXECUTE_TRANSACTION', event);
      
      try {
        const startTime = performance.now();
        const result = await executeTransaction(code);
        const executionTime = performance.now() - startTime;
        
        broadcastToPlugin('database', { 
          type: 'TRANSACTION_RESULT',
          result,
          executionTime
        });
        
        // Send refresh event with updated schema
        logger.info('Transaction completed successfully, sending database refresh');
        const schema = generateSchemaInfo();
        broadcastToPlugin('database', { 
          type: 'DATABASE_REFRESH',
          data: { schema }
        });
      } catch (error: unknown) {
        logger.error('Transaction execution failed:', { error: errorMessage(error) });
        broadcastToPlugin('database', { 
          type: 'TRANSACTION_ERROR',
          error: errorMessage(error)
        });
      }
    },
    handleAiQuery: ({ system, event }) => {
      const { prompt, mode } = databaseSpec.typeOf('GENERATE_AI_QUERY', event);

      if (!prompt?.trim()) {
        logger.error('Invalid prompt provided for AI query generation');
        broadcastToPlugin('database', {
          type: 'QUERY_ERROR',
          error: 'Please provide a valid prompt'
        });
        return;
      }

      const threadsSettings = services.settings.forFeature<ThreadsSettings>(ref('threads')) as any;
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
        broadcastToPlugin('database', { 
          type: 'TRACE_FLOWS_RESULT',
          flows
        });
      } catch (error: unknown) {
        logger.error('Failed to get trace flows:', { error: errorMessage(error) });
        broadcastToPlugin('database', { 
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
        broadcastToPlugin('database', { 
          type: 'FLOW_EVENTS_RESULT',
          flowId,
          events: result.events,
          hasMore: result.hasMore
        });
      } catch (error: unknown) {
        logger.error('Failed to get flow events:', { error: errorMessage(error), flowId });
        broadcastToPlugin('database', { 
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
        broadcastToPlugin('database', { 
          type: 'NODE_DETAILS_RESULT',
          nodeId,
          details
        });
      } catch (error: unknown) {
        logger.error('Failed to get node details:', { error: errorMessage(error), nodeId });
        broadcastToPlugin('database', { 
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
          broadcastToPlugin('database', { 
            type: 'EXPORT_DATABASE_SUCCESS',
            path: resultPath
          });
        },
        (error: unknown) => {
          logger.error('Failed to export database:', { error: errorMessage(error) });
          broadcastToPlugin('database', { 
            type: 'EXPORT_DATABASE_ERROR',
            error: errorMessage(error)
          });
        }
      );
    },
    importDatabase: ({ system, event }) => {
      const { path, skipUnknownDatabases } = databaseSpec.typeOf('IMPORT_DATABASE', event);

      // Replaces stored data and reloads memory from it; on failure the previous data is restored and reloaded. The
      // settings come in with the rest, and the import's migrations write them: run through the settings' writer, it
      // tells the settings system a replacement is running, so nothing is told a change until it ends
      services.settings.whileReplacingData(() => services.appData.importBackup(path, { skipUnknownDatabases })).then(
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
          broadcastToPlugin('database', {
            type: 'IMPORT_DATABASE_SUCCESS',
            message: `Import successful.${nothingToRestore}${fromMissingPacks} Please restart the brain manually.`
          });
          broadcastToPlugin('database', { 
            type: 'DATABASE_REFRESH',
            data: { schema: generateSchemaInfo() }
          });
        },
        (error: unknown) => {
          logger.error('Failed to import database:', { error: errorMessage(error) });
          broadcastToPlugin('database', {
            type: 'IMPORT_DATABASE_ERROR',
            error: errorMessage(error),
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
        broadcastToPlugin('database', {
          type: 'BACKUP_INFO_RESULT',
          info
        });
      } catch (error: unknown) {
        logger.error('Failed to get backup info:', { error: errorMessage(error) });
        broadcastToPlugin('database', {
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
        broadcastToPlugin('database', {
          type: 'RESET_DATABASE_SUCCESS',
          message: 'Database reset successfully. New root flow created.'
        });

        broadcastToPlugin('database', {
          type: 'DATABASE_REFRESH',
          data: { schema: generateSchemaInfo() }
        });
      } catch (error: unknown) {
        logger.error('Database reset failed:', { error: errorMessage(error) });

        broadcastToPlugin('database', {
          type: 'RESET_DATABASE_ERROR',
          error: errorMessage(error)
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

const databaseEntry = { spec: databaseSpec, machine: databaseSystem };

export default databaseEntry;