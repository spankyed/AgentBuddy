import { assign, cancel, createMachine, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/core/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import { EARS } from '@/core/types';
import { repository } from '@/repository';
import { FlowsConnectedData, FlowEntity, NodeEntity } from './config/types';
import { FLOW_ROLES } from './repository';
import { z } from 'zod';
import { createLogger } from '@/core/utils/debug/logger';
import type { ActionEntity } from '@/systems/actions/types';

const logger = createLogger('flows');
const typeOf = safeEvents<ReceivableEvents>();

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
  busEvent('CREATE_EDGE', { flowId: z.string(), sourceId: z.string(), targetId: z.string() }),
  busEvent('DELETE_EDGE', { flowId: z.string(), edgeId: z.string() }),
  busEvent('UPDATE_EDGE', {
    flowId: z.string(),
    edgeId: z.string(),
    oldSource: z.string(),
    oldTarget: z.string(),
    newSource: z.string(),
    newTarget: z.string()
  }),
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
  | { type: 'EDGE_CREATED'; sourceId: EARS.EntityId; targetId: EARS.EntityId; relId: EARS.EntityId }
  | { type: 'EDGE_DELETED'; edgeId: string }
  | { type: 'EDGE_UPDATED'; oldEdgeId: EARS.EntityId; newEdgeId: EARS.EntityId; newSource: EARS.EntityId; newTarget: EARS.EntityId }
  | { type: 'ACTION_CREATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_UPDATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_DELETED'; actionId: EARS.EntityId }

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
      const { flowId, sourceId, targetId } = typeOf('CREATE_EDGE', event);
      const pluginId = flows;
      
      logger.info('Creating edge', { flowId, sourceId, targetId });
      
      const { relId } = repository.flowsCommands.createEdge(sourceId as EARS.EntityId, targetId as EARS.EntityId);
      
      system.get(bus).send(emit(pluginId, {
        type: 'EDGE_CREATED',
        sourceId: sourceId as EARS.EntityId,
        targetId: targetId as EARS.EntityId,
        relId,
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
        FLOWS_SETTINGS_UPDATED: {
          actions: 'handleSettingsUpdate',
        },
      }
    },
    // Add more states as needed
  }
});