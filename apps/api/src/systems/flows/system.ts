import { assign, cancel, createMachine, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/core/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import { EARS } from '@/core/types';
import { repository } from '@/repository';
import { FlowsStartupData, FlowEntity, NodeEntity } from './config/types';
import { z } from 'zod';
import { createLogger } from '@/core/utils/debug/logger';

const logger = createLogger('flows');
const typeOf = safeEvents<ReceivableEvents>();

export const flows = 'flows' as const;

const busEvent = systemBus(flows);

export const IncomingFlowsEvents = [
  busEvent('FLOW_SELECT', { flowId: z.string() }),
  busEvent('CREATE_FLOW', {}),
  busEvent('UPDATE_FLOW_LABEL', { flowId: z.string(), label: z.string() }),
  busEvent('CREATE_NODE', { flowId: z.string(), tempId: z.string(), nodeData: z.any() }),
  busEvent('UPDATE_NODE', { flowId: z.string(), nodeId: z.string(), nodeData: z.any() }),
  busEvent('CREATE_EDGE', { flowId: z.string(), sourceId: z.string(), targetId: z.string() }),
  busEvent('DELETE_EDGE', { flowId: z.string(), edgeId: z.string() }),
] as const

export type FlowsInternalEvents = 
  | SystemEvents

export type OutgoingFlowsEvents =
  | { type: 'FLOWS_STARTUP'; data: FlowsStartupData }
  | { type: 'FLOW_SELECTED'; flowId: EARS.EntityId; data: { nodes: any[]; edges: any[] } }
  | { type: 'FLOW_CREATED'; flow: FlowEntity; flowId: EARS.EntityId; data: { nodes: any[]; edges: any[] } }
  | { type: 'NODE_CREATED'; tempId: string; nodeId: EARS.EntityId; node: any }
  | { type: 'NODE_UPDATED'; nodeId: EARS.EntityId; node: any }
  | { type: 'EDGE_CREATED'; sourceId: EARS.EntityId; targetId: EARS.EntityId; relId: EARS.EntityId }
  | { type: 'EDGE_DELETED'; edgeId: string }

type ReceivableEvents = MergeReceivable<typeof IncomingFlowsEvents, FlowsInternalEvents>

export const FlowsSystemEvents = fromSystem(IncomingFlowsEvents)<OutgoingFlowsEvents, typeof flows>()

// export type FlowEvent = EventFromLogic<typeof flowsSystem>;

export const flowsSystem = setup({
  types: {
    events: {} as ReceivableEvents,
  },
  actors: {},
  actions: {
    sendFlowsStartup: ({ system }) => {
      const pluginId = flows;
      const data = repository.flowsQueries.startupData();
      logger.info('Sending flows startup data to client', { flows: data.flows.length });
      
      system.get(bus).send(emit(pluginId, {
        type: 'FLOWS_STARTUP',
        data,
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
      
      const result = repository.flowsCommands.createFlowWithEntryNode();
      if (!result.success) {
        logger.error('Failed to create flow', { error: result.error });
        return;
      }
      const { flow, entryNode } = result.data;
      
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
      
      const result = repository.flowsCommands.updateFlowLabel(flowId as EARS.EntityId, label);
      if (!result.success) {
        logger.error('Failed to update flow label', { error: result.error });
      }
    },
    
    createNode: ({ system, event }) => {
      const { flowId, tempId, nodeData } = typeOf('CREATE_NODE', event);
      const pluginId = flows;
      
      logger.info('Creating new node', { flowId, tempId, nodeType: nodeData.nodeType });
      
      const result = repository.flowsCommands.createNode(flowId as EARS.EntityId, nodeData);
      if (!result.success) {
        logger.error('Failed to create node', { error: result.error });
        return;
      }
      const node = result.data;
      
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
      
      const updateResult = repository.flowsCommands.updateNode(nodeId as EARS.EntityId, nodeData);
      if (!updateResult.success) {
        logger.error('Failed to update node', { error: updateResult.error });
        return;
      }
      
      const node = repository.flowsQueries.node(nodeId as EARS.EntityId);
      
      system.get(bus).send(emit(pluginId, {
        type: 'NODE_UPDATED',
        nodeId: nodeId as EARS.EntityId,
        node,
      }));
    },
    
    createEdge: ({ system, event }) => {
      const { flowId, sourceId, targetId } = typeOf('CREATE_EDGE', event);
      const pluginId = flows;
      
      logger.info('Creating edge', { flowId, sourceId, targetId });
      
      const result = repository.flowsCommands.createEdge(sourceId as EARS.EntityId, targetId as EARS.EntityId);
      if (!result.success) {
        logger.error('Failed to create edge', { error: result.error });
        return;
      }
      
      const { relId } = result.data;
      
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
      
      const result = repository.flowsCommands.deleteEdge(edgeId as EARS.EntityId);
      if (!result.success) {
        logger.error('Failed to delete edge', { error: result.error });
        return;
      }
      
      system.get(bus).send(emit(pluginId, {
        type: 'EDGE_DELETED',
        edgeId,
      }));
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
          actions: 'sendFlowsStartup',
        },
        FLOW_SELECT: {
          actions: 'selectFlow',
        },
        CREATE_FLOW: {
          actions: 'createFlow',
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
        CREATE_EDGE: {
          actions: 'createEdge',
        },
        DELETE_EDGE: {
          actions: 'deleteEdge',
        },
      }
    },
    // Add more states as needed
  }
});