import type { ThreadsSettings } from '#generated/types.ts';
import { sendToSystem, broadcastToPlugin } from '#generated/events.ts';
// Untyped for now: a typed `reply` needs an `answers` field on the contract and a codegen reader, which
// stays deferred. `onConnected`/`onIncoming` come from here for the same reason.
import { setup } from 'xstate';
import { performance } from 'node:perf_hooks';
import { defineSystem } from '@abuddy/sdk/framework';
import { UnknownBackupDatabasesError } from '@abuddy/sdk/services';
import type { Contract } from './contract.ts';
import { executeQuery } from './execute/query.ts';
import { executeTransaction } from './execute/transaction.ts';
import { generateSchemaInfo } from './repository/schema.ts';
import { getTraceFlows, getFlowEvents, getNodeDetails } from './repository/trace-query.ts';
import { createLogger } from '@abuddy/sdk/logger';
import { services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { ref } from '#generated/ref.ts';
import { errorMessage } from '@abuddy/sdk/utils/pure';

const logger = createLogger('database');

/**
 * What a query answers with, success or failure, as one value.
 *
 * Separating the outcome from the sending is what lets a handler reply exactly once. With the send inside the
 * `try`, a `reply` that threw — which it does when the message named no sender — would land in the `catch`,
 * which would reply again and throw out of an async action as an unhandled rejection.
 */
async function queryAnswer(code: string) {
  try {
    const startTime = performance.now();
    const result = await executeQuery(code);
    return { type: 'QUERY_RESULT' as const, result, executionTime: performance.now() - startTime };
  } catch (error: unknown) {
    logger.error('Query execution failed:', { error: errorMessage(error) });
    return { type: 'QUERY_ERROR' as const, error: errorMessage(error) };
  }
}

/** The same for a transaction; its caller broadcasts the schema change separately on success */
async function transactionAnswer(code: string) {
  try {
    const startTime = performance.now();
    const result = await executeTransaction(code);
    return { type: 'TRANSACTION_RESULT' as const, result, executionTime: performance.now() - startTime };
  } catch (error: unknown) {
    logger.error('Transaction execution failed:', { error: errorMessage(error) });
    return { type: 'TRANSACTION_ERROR' as const, error: errorMessage(error) };
  }
}

export const databaseSpec = defineSystem<Contract>();

export const databaseSystem = setup({
  types: databaseSpec.types,
  actions: databaseSpec.actions({
    sendDatabaseRefresh: () => {
      const schema = generateSchemaInfo();
      broadcastToPlugin('database', { 
        type: 'DATABASE_REFRESH',
        data: { schema }
      });
    },
    /**
     * **Nothing here names the request, and nothing has to.** `reply` is bound to the delivery this handler
     * was entered in, which carries the call the request was sent under, so the answer names it whether it
     * is built in one turn or ten.
     *
     * **That binding is load-bearing, because this action re-enters.** It is `async` on a state with no
     * guard against it, so a second `EXECUTE_QUERY` is accepted while this one is awaiting — and anything
     * holding the current request in context would be the *newer* one's by the time this reply is built.
     * Each handler's `reply` is its own closure, so two answers in flight name two requests.
     */
    executeQuery: async ({ event, reply }) => {
      const { code } = databaseSpec.typeOf('EXECUTE_QUERY', event);
      // Nobody asked: a result with no asker has nowhere to go, and the console that ran it is the asker
      reply?.(await queryAnswer(code));
    },
    /** Answered through the same bound `reply`, for `executeQuery`'s reason above */
    executeTransaction: async ({ event, reply }) => {
      const { code } = databaseSpec.typeOf('EXECUTE_TRANSACTION', event);
      const answer = await transactionAnswer(code);
      reply?.(answer);

      // Still a broadcast, and deliberately: a changed schema is news for every window's schema view, not an
      // answer to the window that ran the transaction. Converting this one would narrow it to the asker.
      if (answer.type === 'TRANSACTION_RESULT') {
        logger.info('Transaction completed successfully, sending database refresh');
        broadcastToPlugin('database', { type: 'DATABASE_REFRESH', data: { schema: generateSchemaInfo() } });
      }
    },
    handleAiQuery: ({ event }) => {
      const { prompt, mode } = databaseSpec.typeOf('GENERATE_AI_QUERY', event);

      if (!prompt?.trim()) {
        logger.error('Invalid prompt provided for AI query generation');
        broadcastToPlugin('database', {
          type: 'AI_QUERY_ERROR',
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
    getTraceFlows: () => {
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
    getFlowEvents: ({ event }) => {
      const { flowId, offset = 0, limit = 50 } = databaseSpec.typeOf('GET_FLOW_EVENTS', event);
      
      try {
        const result = getFlowEvents(flowId, offset, limit);
        logger.info('Retrieved events for flow', { count: result.events.length, flowId });
        broadcastToPlugin('database', { 
          type: 'FLOW_EVENTS_RESULT',
          flowId,
          events: result.events,
          hasMore: result.hasMore,
          offset
        });
      } catch (error: unknown) {
        logger.error('Failed to get flow events:', { error: errorMessage(error), flowId });
        broadcastToPlugin('database', { 
          type: 'FLOW_EVENTS_RESULT',
          flowId,
          events: [],
          hasMore: false,
          offset
        });
      }
    },
    getNodeDetails: ({ event }) => {
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
    exportDatabase: ({ event }) => {
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
    importDatabase: ({ event }) => {
      const { path, skipUnknownDatabases } = databaseSpec.typeOf('IMPORT_DATABASE', event);

      // Replaces stored data and reloads memory from it; on failure the previous data is restored and reloaded. The
      // settings come in with the rest, and the import's migrations write them: run through the settings' writer, it
      // tells the settings system a replacement is running, so nothing is told a change until it ends
      services.settings.whileReplacingData(() => services.appData.importBackup(path, { skipUnknownDatabases })).then(
        ({ missingDatabases, unknownEntityTypes }) => {
          // The brain stops itself: replacing the data sends DATA_REPLACED, which it answers by killing a flow
          // whose rows are gone. It is not restarted here, which is what the message below tells the user
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
    getBackupInfo: async ({ event }) => {
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
    resetDatabase: async () => {
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
  }),
}).createMachine({
  id: 'database',
  initial: 'idle',
  context: () => ({}),
  on: {
    SEND_STATE: {
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