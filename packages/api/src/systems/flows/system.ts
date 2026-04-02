import { assign, cancel, createMachine, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/core/helpers/event-helpers';
import { fromSystem, systemBus } from '@/core/helpers/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/core/helpers/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import { EARS } from '@/core/types';
import { repository } from '@/repository';
import { FlowsConnectedData, FlowEntity, NodeEntity } from './config/types';
import { FLOW_ROLES } from './repository';
import { z } from 'zod';
import { createLogger } from '@/core/helpers/debug/logger';
import type { ActionEntity } from '@/systems/actions/types';
import { compile, validate, exportFlowsDSL, type FlowDSL, type ValidationError } from './dsl';

const logger = createLogger('flows');
const typeOf = safeEvents<ReceivableEvents>();

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

export const flows = 'flows' as const;

const busEvent = systemBus(flows);

export const IncomingFlowsEvents = [
  busEvent('FLOW_SELECT', { flowId: z.string() }),
  busEvent('CREATE_FLOW', {}),
  busEvent('DELETE_FLOW', { flowId: z.string() }),
  busEvent('UPDATE_FLOW_LABEL', { flowId: z.string(), label: z.string() }),
  busEvent('CREATE_NODE', { flowId: z.string(), tempId: z.string(), nodeData: z.any() }),
  busEvent('UPDATE_NODE', { flowId: z.string(), nodeId: z.string(), nodeData: z.any() }),
  busEvent('DELETE_NODE', { flowId: z.string(), nodeId: z.string() }),
  busEvent('CREATE_EDGE', { flowId: z.string(), sourceId: z.string(), targetId: z.string(), sourceHandle: z.string().optional(), targetHandle: z.string().optional() }),
  busEvent('DELETE_EDGE', { flowId: z.string(), edgeId: z.string() }),
  busEvent('UPDATE_EDGE', {
    flowId: z.string(),
    edgeId: z.string(),
    oldSource: z.string(),
    oldTarget: z.string(),
    newSource: z.string(),
    newTarget: z.string()
  }),
  busEvent('IMPORT_DSL', { dsl: z.any() }),
  busEvent('EXPORT_DSL', { directory: z.string() }),
  busEvent('REINDEX_HANDLES', { flowId: z.string(), nodeId: z.string(), prefix: z.string(), index: z.number(), direction: z.union([z.literal(1), z.literal(-1)]) }),
] as const

export type FlowsInternalEvents = 
  | SystemEvents
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
  | { type: 'EDGE_DELETED'; edgeId: string }
  | { type: 'EDGE_UPDATED'; oldEdgeId: EARS.EntityId; newEdgeId: EARS.EntityId; newSource: EARS.EntityId; newTarget: EARS.EntityId }
  | { type: 'ACTION_CREATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_UPDATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_DELETED'; actionId: EARS.EntityId }
  | { type: 'DSL_IMPORTED'; flowIds: EARS.EntityId[]; errors?: string[] }
  | { type: 'DSL_IMPORT_FAILED'; errors: string[] }
  | { type: 'DSL_EXPORTED'; filePath: string; flowCount: number }
  | { type: 'DSL_EXPORT_FAILED'; errors: string[] }

type ReceivableEvents = MergeReceivable<typeof IncomingFlowsEvents, FlowsInternalEvents>

export const FlowsSystemEvents = fromSystem(IncomingFlowsEvents)<OutgoingFlowsEvents, typeof flows>()

// export type FlowEvent = EventFromLogic<typeof flowsSystem>;

export const flowsSystem = setup({
  types: {
    events: {} as ReceivableEvents,
  },
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
      const { flowId } = typeOf('FLOW_SELECT', event);
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
      const { flowId, label } = typeOf('UPDATE_FLOW_LABEL', event);

      logger.info('Updating flow label', { flowId, label });

      repository.flowsCommands.updateFlowLabel(flowId as EARS.EntityId, label);
    },

    deleteFlow: ({ system, event }) => {
      const { flowId } = typeOf('DELETE_FLOW', event);
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
      const { flowId, tempId, nodeData } = typeOf('CREATE_NODE', event);
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
      const { flowId, nodeId, nodeData } = typeOf('UPDATE_NODE', event);
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
      const { flowId, nodeId } = typeOf('DELETE_NODE', event);
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
      const { flowId, sourceId, targetId, sourceHandle, targetHandle } = typeOf('CREATE_EDGE', event);
      const pluginId = flows;

      logger.info('Creating edge', { flowId, sourceId, targetId, sourceHandle, targetHandle });

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
    },
    
    deleteEdge: ({ system, event }) => {
      const { flowId, edgeId } = typeOf('DELETE_EDGE', event);
      const pluginId = flows;
      
      logger.info('Deleting edge', { flowId, edgeId });
      
      repository.flowsCommands.deleteEdge(edgeId as EARS.EntityId);
      
      system.get(bus).send(emit(pluginId, {
        type: 'EDGE_DELETED',
        edgeId,
      }));
    },
    
    updateEdge: ({ system, event }) => {
      const { flowId, edgeId, oldSource, oldTarget, newSource, newTarget } = typeOf('UPDATE_EDGE', event);
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
      const { settings, changes } = typeOf('FLOWS_SETTINGS_UPDATED', event);
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
      const { dsl } = typeOf('IMPORT_DSL', event);
      const pluginId = flows;

      logger.info('Importing DSL flows', { flowCount: Object.keys(dsl || {}).length });

      // Get available actions and prompts for reference resolution
      const actions = repository.actionQueries.all();
      const prompts = repository.promptQueries.all();

      // Validate DSL
      const validation = validate(dsl, {
        actions: actions.map(a => a.label),
        prompts: prompts.map(p => p.label),
      });

      if (!validation.valid) {
        const errors = formatValidationErrors(validation.errors, {
          actions: actions.map(a => a.label),
          prompts: prompts.map(p => p.label),
        });
        logger.warn('DSL validation failed', { errors });

        system.get(bus).send(emit(pluginId, {
          type: 'DSL_IMPORT_FAILED',
          errors,
        }));
        return;
      }

      // Build lookup maps for compiler
      const actionMap = new Map(actions.map(a => [a.label, a.id]));
      const promptMap = new Map(prompts.map(p => [p.label, p.id]));

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
      const { nodeId, prefix, index, direction } = typeOf('REINDEX_HANDLES', event);
      repository.flowsCommands.reindexHandles(nodeId as EARS.EntityId, prefix, index, direction);
    },

    exportDSL: ({ system, event }) => {
      const { directory } = typeOf('EXPORT_DSL', event);
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
    // Add more states as needed
  }
});