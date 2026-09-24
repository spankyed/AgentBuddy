import type { FlowsSettings } from '@/__generated__/types';
import { services } from '@/__generated__/services';
import { broadcastToPlugin } from '@/__generated__/events';
import { assign, cancel, createMachine, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import { EARS } from '@/__generated__/ears';
import { repository } from '@/__generated__/repository';
import type { Contract } from './contract';
import type { FlowsConnectedData, NodeEntity } from './types';
import { FLOW_ROLES } from './repository';
import { createLogger } from '@abuddy/sdk/logger';
import type { FlowEntity, ActionEntity, PromptEntity } from '@abuddy/sdk';
import { compileFlowDSL, validateFlowDSL, exportFlowsToDSL, type FlowDSL, type ValidationError } from '@abuddy/sdk/build';
import { ref } from '@/__generated__/ref';
import { errorMessage } from '@abuddy/sdk/utils/pure';

const logger = createLogger('flows');

/**
 * Format validation errors into a cleaner, deduplicated format.
 * Groups missing actions/prompts and shows "Available" list only once.
 */
function formatValidationErrors(
  errors: ValidationError[],
  available: { actions: string[]; prompts: string[] }
): string[] {
  const missingActions = new Set<string>();
  const missingPrompts = new Set<string>();
  const otherErrors: string[] = [];

  for (const error of errors) {
    // Extract missing action/prompt names from error messages
    const actionMatch = error.message.match(/Action "([^"]+)" not found/);
    const promptMatch = error.message.match(/Prompt "([^"]+)" not found/);

    if (actionMatch) {
      missingActions.add(actionMatch[1]);
    } else if (promptMatch) {
      missingPrompts.add(promptMatch[1]);
    } else {
      // Non-reference errors: show path and message
      otherErrors.push(`${error.path}: ${error.message}`);
    }
  }

  const result: string[] = [];

  if (missingActions.size > 0) {
    result.push(`${missingActions.size} action(s) not found: ${Array.from(missingActions).join(', ')}`);
    result.push(`Available actions: ${available.actions.join(', ') || '(none)'}`);
  }

  if (missingPrompts.size > 0) {
    result.push(`${missingPrompts.size} prompt(s) not found: ${Array.from(missingPrompts).join(', ')}`);
    result.push(`Available prompts: ${available.prompts.join(', ') || '(none)'}`);
  }

  result.push(...otherErrors);

  return result;
}

export const flowsSpec = defineSystem<Contract>();

/** Sends the plugin its flows, the root flow among them (the flow with the root role), and its settings */
function sendConnectedData(): void {
  broadcastToPlugin('flows', {
    type: 'FLOWS_CONNECTED',
    data: {
      ...repository.flowsQueries.connectedData(),
      settings: services.settings.forFeature<FlowsSettings>(ref('flows')) || {},
    },
  });
}

export const flowsSystem = setup({
  types: flowsSpec.types,
  actors: {},
  actions: {
    handleClientConnection: ({ system }) => {
      logger.info('Sending flows connected data to client');
      sendConnectedData();
    },

    selectFlow: ({ system, event }) => {
      const { flowId } = flowsSpec.typeOf('FLOW_SELECT', event);
      const pluginId = 'flows' as const;
      
      logger.info('Selecting flow', { flowId });
      
      const data = repository.flowsQueries.extendedData(flowId as EARS.EntityId);
      
      broadcastToPlugin(pluginId, {
        type: 'FLOW_SELECTED',
        flowId: flowId as EARS.EntityId,
        data,
      });
    },
    
    createFlow: ({ system, event }) => {
      const pluginId = 'flows' as const;
      
      logger.info('Creating new flow');
      
      const { flow, entryNode } = repository.flowsCommands.createFlowWithEntryNode();
      
      const data = repository.flowsQueries.extendedData(flow.id);
      
      broadcastToPlugin(pluginId, {
        type: 'FLOW_CREATED',
        flow,
        flowId: flow.id,
        data,
      });
    },
    
    updateFlowLabel: ({ system, event }) => {
      const { flowId, label } = flowsSpec.typeOf('UPDATE_FLOW_LABEL', event);

      logger.info('Updating flow label', { flowId, label });

      repository.flowsCommands.updateFlowLabel(flowId as EARS.EntityId, label);
    },

    deleteFlow: ({ system, event }) => {
      const { flowId } = flowsSpec.typeOf('DELETE_FLOW', event);
      const pluginId = 'flows' as const;

      logger.info('Deleting flow', { flowId });

      try {
        repository.flowsCommands.deleteFlow(flowId as EARS.EntityId);

        broadcastToPlugin(pluginId, {
          type: 'FLOW_DELETED',
          flowId: flowId as EARS.EntityId,
        });

        logger.info('Flow deleted successfully', { flowId });
      } catch (error) {
        logger.error('Failed to delete flow', { flowId, error });
        throw error;
      }
    },
    
    createNode: ({ system, event }) => {
      const { flowId, tempId, nodeData } = flowsSpec.typeOf('CREATE_NODE', event);
      const pluginId = 'flows' as const;
      
      logger.info('Creating new node', { flowId, tempId, nodeType: nodeData.nodeType });
      
      const node = repository.flowsCommands.createNode(flowId as EARS.EntityId, nodeData);
      
      broadcastToPlugin(pluginId, {
        type: 'NODE_CREATED',
        tempId,
        nodeId: node.id,
        node,
      });
    },
    
    updateNode: ({ system, event }) => {
      const { flowId, nodeId, nodeData } = flowsSpec.typeOf('UPDATE_NODE', event);
      const pluginId = 'flows' as const;
      
      logger.info('Updating node', { flowId, nodeId, updates: nodeData });
      
      repository.flowsCommands.updateNode(nodeId as EARS.EntityId, nodeData);
      
      const node = repository.flowsQueries.node(nodeId as EARS.EntityId);
      
      broadcastToPlugin(pluginId, {
        type: 'NODE_UPDATED',
        nodeId: nodeId as EARS.EntityId,
        node,
      });
    },
    
    deleteNode: ({ system, event }) => {
      const { flowId, nodeId } = flowsSpec.typeOf('DELETE_NODE', event);
      const pluginId = 'flows' as const;
      
      logger.info('Deleting node', { flowId, nodeId });
      
      repository.flowsCommands.deleteNode(nodeId as EARS.EntityId);
      
      // Send confirmation back to frontend
      broadcastToPlugin(pluginId, {
        type: 'NODE_DELETED',
        nodeId,
      });
    },
    
    createEdge: ({ system, event }) => {
      const { flowId, sourceId, targetId, sourceHandle, targetHandle } = flowsSpec.typeOf('CREATE_EDGE', event);
      const pluginId = 'flows' as const;

      logger.info('Creating edge', { flowId, sourceId, targetId, sourceHandle, targetHandle });

      try {
        const { relId } = repository.flowsCommands.createEdge(
          sourceId as EARS.EntityId,
          targetId as EARS.EntityId,
          { sourceHandle, targetHandle }
        );

        broadcastToPlugin(pluginId, {
          type: 'EDGE_CREATED',
          sourceId: sourceId as EARS.EntityId,
          targetId: targetId as EARS.EntityId,
          relId,
          sourceHandle,
          targetHandle,
        });
      } catch (err: any) {
        logger.warn('Edge creation failed', { sourceId, targetId, error: err.message });
        broadcastToPlugin(pluginId, {
          type: 'EDGE_CREATE_FAILED',
          sourceId,
          targetId,
          error: err.message || 'Edge creation failed',
        });
      }
    },
    
    deleteEdge: ({ system, event }) => {
      const { flowId, edgeId } = flowsSpec.typeOf('DELETE_EDGE', event);
      const pluginId = 'flows' as const;
      
      logger.info('Deleting edge', { flowId, edgeId });
      
      repository.flowsCommands.deleteEdge(edgeId as EARS.EntityId);
      
      broadcastToPlugin(pluginId, {
        type: 'EDGE_DELETED',
        edgeId,
      });
    },
    
    updateEdge: ({ system, event }) => {
      const { flowId, edgeId, source, target, sourceHandle, targetHandle } = flowsSpec.typeOf('UPDATE_EDGE', event);
      const pluginId = 'flows' as const;

      logger.info('Updating edge', { flowId, edgeId, source, target, sourceHandle, targetHandle });

      try {
        repository.flowsCommands.updateEdge(edgeId as EARS.EntityId, {
          source: source as EARS.EntityId,
          target: target as EARS.EntityId,
          sourceHandle,
          targetHandle,
        });
        broadcastToPlugin(pluginId, {
          type: 'EDGE_UPDATED',
          edgeId: edgeId as EARS.EntityId,
          source: source as EARS.EntityId,
          target: target as EARS.EntityId,
          sourceHandle,
          targetHandle,
        });
      } catch (err: any) {
        logger.warn('Edge update failed', { edgeId, source, target, error: err.message });
        // The canvas already moved the edge: send the flow as stored, and the reason
        broadcastToPlugin(pluginId, {
          type: 'FLOW_SELECTED',
          flowId: flowId as EARS.EntityId,
          data: repository.flowsQueries.extendedData(flowId as EARS.EntityId),
        });
        broadcastToPlugin(pluginId, {
          type: 'EDGE_UPDATE_FAILED',
          edgeId,
          error: err.message || 'Edge update failed',
        });
      }
    },
    
    setRootFlow: ({ system, event }) => {
      const { flowId } = flowsSpec.typeOf('SET_ROOT_FLOW', event);
      const previous = repository.flowsQueries.rootFlow();
      if ((flowId ?? undefined) === previous) return;
      logger.info('Changing the root flow', { previousRootFlowId: previous, rootFlowId: flowId });
      if (flowId) repository.flowsCommands.grantRootFlowRole(flowId as EARS.EntityId);
      else if (previous) repository.flowsCommands.revokeRootFlowRole(previous);
      sendConnectedData();
    },

    importDSL: ({ system, event }) => {
      const { dsl } = flowsSpec.typeOf('IMPORT_DSL', event);
      const pluginId = 'flows' as const;

      logger.info('Importing DSL flows', { flowCount: Object.keys(dsl || {}).length });

      // Get available actions and prompts for reference resolution
      const actions = repository.actionQueries.all();
      const prompts = repository.promptQueries.all();

      // Validate DSL
      const validation = validateFlowDSL(dsl, {
        actions: actions.map((a: ActionEntity) => a.label),
        prompts: prompts.map((p: PromptEntity) => p.label),
      });

      if (!validation.valid) {
        const errors = formatValidationErrors(validation.errors, {
          actions: actions.map((a: ActionEntity) => a.label),
          prompts: prompts.map((p: PromptEntity) => p.label),
        });
        logger.warn('DSL validation failed', { errors });

        broadcastToPlugin(pluginId, {
          type: 'DSL_IMPORT_FAILED',
          errors,
        });
        return;
      }

      // Build lookup maps for compiler
      const actionMap = new Map<string, string>(actions.map((a: ActionEntity) => [a.label, a.id]));
      const promptMap = new Map<string, string>(prompts.map((p: PromptEntity) => [p.label, p.id]));

      // Compile DSL
      const compiled = compileFlowDSL(dsl as FlowDSL, {
        actions: actionMap,
        prompts: promptMap,
      });

      // Import into EARS
      const { flowIds } = repository.flowsCommands.importFromDSL(compiled);

      broadcastToPlugin(pluginId, {
        type: 'DSL_IMPORTED',
        flowIds,
      });
      // The flows, and the root flow if the import brought one
      sendConnectedData();

      logger.info('DSL import complete', { flowIds });
    },

    reindexHandles: ({ event }) => {
      const { nodeId, prefix, index, direction } = flowsSpec.typeOf('REINDEX_HANDLES', event);
      repository.flowsCommands.reindexHandles(nodeId as EARS.EntityId, prefix, index, direction);
    },

    exportDSL: ({ system, event }) => {
      const { directory, flowId } = flowsSpec.typeOf('EXPORT_DSL', event);
      const pluginId = 'flows' as const;

      logger.info('Exporting flows to DSL', { directory, flowId });

      try {
        const { filePath, flowCount } = exportFlowsToDSL(directory, {
          rootFlowRole: FLOW_ROLES.ROOT_FLOW,
          flowIds: flowId ? [flowId] : undefined,
        });

        broadcastToPlugin(pluginId, {
          type: 'DSL_EXPORTED',
          filePath,
          flowCount,
        });

        logger.info('DSL export complete', { filePath, flowCount });
      } catch (error) {
        const message = errorMessage(error);
        logger.error('DSL export failed', { error: message });

        broadcastToPlugin(pluginId, {
          type: 'DSL_EXPORT_FAILED',
          errors: [message],
        });
      }
    },
  },
  guards: {},
  delays: {}
}).createMachine({
  id: 'flows',
  initial: 'idle',
  context: {},
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
          actions: 'handleClientConnection',
        },
        // A pack's seeds can add or change flows
        PACK_CHANGED: {
          actions: 'handleClientConnection',
        },
        FLOW_SELECT: {
          actions: 'selectFlow',
        },
        CREATE_FLOW: {
          actions: 'createFlow',
        },
        DELETE_FLOW: {
          actions: 'deleteFlow',
        },
        UPDATE_FLOW_LABEL: {
          actions: 'updateFlowLabel',
        },
        CREATE_NODE: {
          actions: 'createNode',
        },
        UPDATE_NODE: {
          actions: 'updateNode',
        },
        DELETE_NODE: {
          actions: 'deleteNode',
        },
        CREATE_EDGE: {
          actions: 'createEdge',
        },
        DELETE_EDGE: {
          actions: 'deleteEdge',
        },
        UPDATE_EDGE: {
          actions: 'updateEdge',
        },
        REINDEX_HANDLES: {
          actions: 'reindexHandles',
        },
        SET_ROOT_FLOW: {
          actions: 'setRootFlow',
        },
        IMPORT_DSL: {
          actions: 'importDSL',
        },
        EXPORT_DSL: {
          actions: 'exportDSL',
        },
      }
    },
  }
});

const flowsEntry = { spec: flowsSpec, machine: flowsSystem };

export default flowsEntry;