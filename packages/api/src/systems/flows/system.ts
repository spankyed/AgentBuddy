import { assign, cancel, createMachine, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import { defineSystem } from '@/core/framework/define-system';
import { bus } from '@/core/system-ids';
import { emit, getActor, sendParentSafe } from '@/core/helpers/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import { EARS } from '@/core/types';
import { repository } from '@/repository';
import { FlowsConnectedData, FlowEntity, NodeEntity } from './config/types';
import { FLOW_ROLES } from './repository';
import { createLogger } from '@/core/helpers/debug/logger';
import type { ActionEntity } from '@/core/shared-types/actions';
import type { PromptEntity } from '@/core/shared-types/prompts';
import { compile, validate, exportFlowsDSL, type FlowDSL, type ValidationError } from './dsl';

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

type IncomingFlowsEvents =
  | { type: 'FLOW_SELECT'; flowId: string }
  | { type: 'CREATE_FLOW' }
  | { type: 'DELETE_FLOW'; flowId: string }
  | { type: 'UPDATE_FLOW_LABEL'; flowId: string; label: string }
  | { type: 'CREATE_NODE'; flowId: string; tempId: string; nodeData: any }
  | { type: 'UPDATE_NODE'; flowId: string; nodeId: string; nodeData: any }
  | { type: 'DELETE_NODE'; flowId: string; nodeId: string }
  | { type: 'CREATE_EDGE'; flowId: string; sourceId: string; targetId: string; sourceHandle?: string; targetHandle?: string }
  | { type: 'DELETE_EDGE'; flowId: string; edgeId: string }
  | { type: 'UPDATE_EDGE'; flowId: string; edgeId: string; oldSource: string; oldTarget: string; newSource: string; newTarget: string }
  | { type: 'IMPORT_DSL'; dsl: any }
  | { type: 'EXPORT_DSL'; directory: string }
  | { type: 'REINDEX_HANDLES'; flowId: string; nodeId: string; prefix: string; index: number; direction: 1 | -1 }

type FlowsInternalEvents =
  | { type: 'FLOWS_SETTINGS_UPDATED'; settings: any; changes?: any }

export type OutgoingFlowsEvents =
  | { type: 'FLOWS_CONNECTED'; data: FlowsConnectedData }
  | { type: 'FLOW_SELECTED'; flowId: EARS.EntityId; data: { nodes: any[]; edges: any[] } }
  | { type: 'FLOW_CREATED'; flow: FlowEntity; flowId: EARS.EntityId; data: { nodes: any[]; edges: any[] } }
  | { type: 'FLOW_DELETED'; flowId: EARS.EntityId }
  | { type: 'NODE_CREATED'; tempId: string; nodeId: EARS.EntityId; node: any }
  | { type: 'NODE_UPDATED'; nodeId: EARS.EntityId; node: any }
  | { type: 'NODE_DELETED'; nodeId: string }
  | { type: 'EDGE_CREATED'; sourceId: EARS.EntityId; targetId: EARS.EntityId; relId: EARS.EntityId; sourceHandle?: string; targetHandle?: string }
  | { type: 'EDGE_CREATE_FAILED'; sourceId: string; targetId: string; error: string }
  | { type: 'EDGE_DELETED'; edgeId: string }
  | { type: 'EDGE_UPDATED'; oldEdgeId: EARS.EntityId; newEdgeId: EARS.EntityId; newSource: EARS.EntityId; newTarget: EARS.EntityId }
  | { type: 'ACTION_CREATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_UPDATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_DELETED'; actionId: EARS.EntityId }
  | { type: 'DSL_IMPORTED'; flowIds: EARS.EntityId[]; errors?: string[] }
  | { type: 'DSL_IMPORT_FAILED'; errors: string[] }
  | { type: 'DSL_EXPORTED'; filePath: string; flowCount: number }
  | { type: 'DSL_EXPORT_FAILED'; errors: string[] }

export const flowsDef = defineSystem('flows')<IncomingFlowsEvents | FlowsInternalEvents, OutgoingFlowsEvents>();
export const flows = flowsDef.id;

export const flowsSystem = setup({
  types: flowsDef.types,
  actors: {},
  actions: {
    handleClientConnection: ({ system }) => {
      const pluginId = flows;
      const data = repository.flowsQueries.connectedData();
      const flowsSettings = repository.settingsQueries.getPluginSettings('flows');
      logger.info('Sending flows connected data to client', { flows: data.flows.length });

      system.get(bus).send(emit(pluginId, {
        type: 'FLOWS_CONNECTED',
        data: {
          ...data,
          settings: flowsSettings || {}
        },
      }));
    },

    selectFlow: ({ system, event }) => {
      const { flowId } = flowsDef.typeOf('FLOW_SELECT', event);
      const pluginId = flows;
      
      logger.info('Selecting flow', { flowId });
      
      const data = repository.flowsQueries.extendedData(flowId as EARS.EntityId);
      
      system.get(bus).send(emit(pluginId, {
        type: 'FLOW_SELECTED',
        flowId: flowId as EARS.EntityId,
        data,
      }));
    },
    
    createFlow: ({ system, event }) => {
      const pluginId = flows;
      
      logger.info('Creating new flow');
      
      const { flow, entryNode } = repository.flowsCommands.createFlowWithEntryNode();
      
      const data = repository.flowsQueries.extendedData(flow.id);
      
      system.get(bus).send(emit(pluginId, {
        type: 'FLOW_CREATED',
        flow,
        flowId: flow.id,
        data,
      }));
    },
    
    updateFlowLabel: ({ system, event }) => {
      const { flowId, label } = flowsDef.typeOf('UPDATE_FLOW_LABEL', event);

      logger.info('Updating flow label', { flowId, label });

      repository.flowsCommands.updateFlowLabel(flowId as EARS.EntityId, label);
    },

    deleteFlow: ({ system, event }) => {
      const { flowId } = flowsDef.typeOf('DELETE_FLOW', event);
      const pluginId = flows;

      logger.info('Deleting flow', { flowId });

      try {
        repository.flowsCommands.deleteFlow(flowId as EARS.EntityId);

        system.get(bus).send(emit(pluginId, {
          type: 'FLOW_DELETED',
          flowId: flowId as EARS.EntityId,
        }));

        logger.info('Flow deleted successfully', { flowId });
      } catch (error) {
        logger.error('Failed to delete flow', { flowId, error });
        throw error;
      }
    },
    
    createNode: ({ system, event }) => {
      const { flowId, tempId, nodeData } = flowsDef.typeOf('CREATE_NODE', event);
      const pluginId = flows;
      
      logger.info('Creating new node', { flowId, tempId, nodeType: nodeData.nodeType });
      
      const node = repository.flowsCommands.createNode(flowId as EARS.EntityId, nodeData);
      
      system.get(bus).send(emit(pluginId, {
        type: 'NODE_CREATED',
        tempId,
        nodeId: node.id,
        node,
      }));
    },
    
    updateNode: ({ system, event }) => {
      const { flowId, nodeId, nodeData } = flowsDef.typeOf('UPDATE_NODE', event);
      const pluginId = flows;
      
      logger.info('Updating node', { flowId, nodeId, updates: nodeData });
      
      repository.flowsCommands.updateNode(nodeId as EARS.EntityId, nodeData);
      
      const node = repository.flowsQueries.node(nodeId as EARS.EntityId);
      
      system.get(bus).send(emit(pluginId, {
        type: 'NODE_UPDATED',
        nodeId: nodeId as EARS.EntityId,
        node,
      }));
    },
    
    deleteNode: ({ system, event }) => {
      const { flowId, nodeId } = flowsDef.typeOf('DELETE_NODE', event);
      const pluginId = flows;
      
      logger.info('Deleting node', { flowId, nodeId });
      
      repository.flowsCommands.deleteNode(nodeId as EARS.EntityId);
      
      // Send confirmation back to frontend
      system.get(bus).send(emit(pluginId, {
        type: 'NODE_DELETED',
        nodeId,
      }));
    },
    
    createEdge: ({ system, event }) => {
      const { flowId, sourceId, targetId, sourceHandle, targetHandle } = flowsDef.typeOf('CREATE_EDGE', event);
      const pluginId = flows;

      logger.info('Creating edge', { flowId, sourceId, targetId, sourceHandle, targetHandle });

      try {
        const { relId } = repository.flowsCommands.createEdge(
          sourceId as EARS.EntityId,
          targetId as EARS.EntityId,
          { sourceHandle, targetHandle }
        );

        system.get(bus).send(emit(pluginId, {
          type: 'EDGE_CREATED',
          sourceId: sourceId as EARS.EntityId,
          targetId: targetId as EARS.EntityId,
          relId,
          sourceHandle,
          targetHandle,
        }));
      } catch (err: any) {
        logger.warn('Edge creation failed', { sourceId, targetId, error: err.message });
        system.get(bus).send(emit(pluginId, {
          type: 'EDGE_CREATE_FAILED',
          sourceId,
          targetId,
          error: err.message || 'Edge creation failed',
        }));
      }
    },
    
    deleteEdge: ({ system, event }) => {
      const { flowId, edgeId } = flowsDef.typeOf('DELETE_EDGE', event);
      const pluginId = flows;
      
      logger.info('Deleting edge', { flowId, edgeId });
      
      repository.flowsCommands.deleteEdge(edgeId as EARS.EntityId);
      
      system.get(bus).send(emit(pluginId, {
        type: 'EDGE_DELETED',
        edgeId,
      }));
    },
    
    updateEdge: ({ system, event }) => {
      const { flowId, edgeId, oldSource, oldTarget, newSource, newTarget } = flowsDef.typeOf('UPDATE_EDGE', event);
      const pluginId = flows;
      
      logger.info('Updating edge', { flowId, edgeId, oldSource, oldTarget, newSource, newTarget });
      
      const { newRelId } = repository.flowsCommands.updateEdge(
        edgeId as EARS.EntityId, 
        oldSource as EARS.EntityId,
        oldTarget as EARS.EntityId,
        newSource as EARS.EntityId, 
        newTarget as EARS.EntityId
      );
      
      system.get(bus).send(emit(pluginId, {
        type: 'EDGE_UPDATED',
        oldEdgeId: edgeId as EARS.EntityId,
        newEdgeId: newRelId,
        newSource: newSource as EARS.EntityId,
        newTarget: newTarget as EARS.EntityId,
      }));
    },
    
    handleSettingsUpdate: ({ system, event }) => {
      const { settings, changes } = flowsDef.typeOf('FLOWS_SETTINGS_UPDATED', event);
      const pluginId = flows;

      // Get the current root flow (the one with the root_flow role)
      const currentRootFlowId = repository.flowsQueries.rootFlow();

      // Check if rootFlowId changed by comparing with current
      const newRootFlowId = settings.rootFlowId;

      if (currentRootFlowId !== newRootFlowId) {
        logger.info('Updating root flow', {
          previousRootFlowId: currentRootFlowId,
          newRootFlowId
        });

        // Revoke root_flow role from previous flow if it exists
        if (currentRootFlowId) {
          repository.flowsCommands.revokeRootFlowRole(currentRootFlowId);
        }

        // Grant root_flow role to new flow if specified
        if (newRootFlowId) {
          repository.flowsCommands.grantRootFlowRole(newRootFlowId as EARS.EntityId);
        }

        // Send updated connected data to reflect the change
        const data = repository.flowsQueries.connectedData();
        const flowsSettings = repository.settingsQueries.getPluginSettings('flows');

        system.get(bus).send(emit(pluginId, {
          type: 'FLOWS_CONNECTED',
          data: {
            ...data,
            settings: flowsSettings || {}
          },
        }));
      }
    },

    importDSL: ({ system, event }) => {
      const { dsl } = flowsDef.typeOf('IMPORT_DSL', event);
      const pluginId = flows;

      logger.info('Importing DSL flows', { flowCount: Object.keys(dsl || {}).length });

      // Get available actions and prompts for reference resolution
      const actions = repository.actionQueries.all();
      const prompts = repository.promptQueries.all();

      // Validate DSL
      const validation = validate(dsl, {
        actions: actions.map((a: ActionEntity) => a.label),
        prompts: prompts.map((p: PromptEntity) => p.label),
      });

      if (!validation.valid) {
        const errors = formatValidationErrors(validation.errors, {
          actions: actions.map((a: ActionEntity) => a.label),
          prompts: prompts.map((p: PromptEntity) => p.label),
        });
        logger.warn('DSL validation failed', { errors });

        system.get(bus).send(emit(pluginId, {
          type: 'DSL_IMPORT_FAILED',
          errors,
        }));
        return;
      }

      // Build lookup maps for compiler
      const actionMap = new Map<string, string>(actions.map((a: ActionEntity) => [a.label, a.id]));
      const promptMap = new Map<string, string>(prompts.map((p: PromptEntity) => [p.label, p.id]));

      // Compile DSL
      const compiled = compile(dsl as FlowDSL, {
        actions: actionMap,
        prompts: promptMap,
      });

      // Import into EARS
      const { flowIds } = repository.flowsCommands.importFromDSL(compiled);

      // Send success response with updated flows data
      const data = repository.flowsQueries.connectedData();
      const flowsSettings = repository.settingsQueries.getPluginSettings('flows');

      system.get(bus).send(emit(pluginId, {
        type: 'DSL_IMPORTED',
        flowIds,
      }));

      // Also send updated connected data
      system.get(bus).send(emit(pluginId, {
        type: 'FLOWS_CONNECTED',
        data: {
          ...data,
          settings: flowsSettings || {}
        },
      }));

      logger.info('DSL import complete', { flowIds });
    },

    reindexHandles: ({ event }) => {
      const { nodeId, prefix, index, direction } = flowsDef.typeOf('REINDEX_HANDLES', event);
      repository.flowsCommands.reindexHandles(nodeId as EARS.EntityId, prefix, index, direction);
    },

    exportDSL: ({ system, event }) => {
      const { directory } = flowsDef.typeOf('EXPORT_DSL', event);
      const pluginId = flows;

      logger.info('Exporting flows to DSL', { directory });

      try {
        const { filePath, flowCount } = exportFlowsDSL(directory);

        system.get(bus).send(emit(pluginId, {
          type: 'DSL_EXPORTED',
          filePath,
          flowCount,
        }));

        logger.info('DSL export complete', { filePath, flowCount });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('DSL export failed', { error: message });

        system.get(bus).send(emit(pluginId, {
          type: 'DSL_EXPORT_FAILED',
          errors: [message],
        }));
      }
    },
  },
  guards: {},
  delays: {}
}).createMachine({
  id: flows,
  initial: 'idle',
  context: {},
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
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
        FLOWS_SETTINGS_UPDATED: {
          actions: 'handleSettingsUpdate',
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