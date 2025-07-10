import { assign, cancel, createMachine, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import { EARS } from '@/shared/ears/types';
import flowsStartupData from './repository/startup';
import { FlowsStartupData, FlowEntity, NodeEntity } from './types';
import { getExtendedData, getNode } from './repository/read';
import { createFlowWithEntryNode, createNode, createEdge } from './repository/create';
import { updateFlowLabel, updateNode } from './repository/update';
import { z } from 'zod';
import { createLogger } from '@/shared/debug/logger';

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
] as const

export type FlowsInternalEvents = 
  | SystemEvents

export type OutgoingFlowsEvents =
  | { type: 'FLOWS_STARTUP'; data: FlowsStartupData }
  | { type: 'FLOW_SELECTED'; flowId: EARS.EntityId; data: { nodes: any[]; edges: any[] } }
  | { type: 'FLOW_CREATED'; flow: FlowEntity; flowId: EARS.EntityId; data: { nodes: any[]; edges: any[] } }
  | { type: 'NODE_CREATED'; tempId: string; nodeId: EARS.EntityId; node: any }
  | { type: 'NODE_UPDATED'; nodeId: EARS.EntityId; node: any }
  | { type: 'EDGE_CREATED'; sourceId: EARS.EntityId; targetId: EARS.EntityId }

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
      const data = flowsStartupData();
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
      
      const data = getExtendedData(flowId as EARS.EntityId);
      
      system.get(bus).send(emit(pluginId, {
        type: 'FLOW_SELECTED',
        flowId: flowId as EARS.EntityId,
        data,
      }));
    },
    
    createFlow: ({ system, event }) => {
      const pluginId = flows;
      
      logger.info('Creating new flow');
      
      const { flow, entryNode } = createFlowWithEntryNode();
      
      const data = getExtendedData(flow.id);
      
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
      
      updateFlowLabel(flowId as EARS.EntityId, label);
    },
    
    createNode: ({ system, event }) => {
      const { flowId, tempId, nodeData } = typeOf('CREATE_NODE', event);
      const pluginId = flows;
      
      logger.info('Creating new node', { flowId, tempId, nodeType: nodeData.nodeType });
      
      const node = createNode(flowId as EARS.EntityId, nodeData);
      
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
      
      logger.info('Updating node', { flowId, nodeId, updates: Object.keys(nodeData) });
      
      updateNode(nodeId as EARS.EntityId, nodeData);
      
      const node = getNode(nodeId as EARS.EntityId);
      
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
      
      createEdge(sourceId as EARS.EntityId, targetId as EARS.EntityId);
      
      system.get(bus).send(emit(pluginId, {
        type: 'EDGE_CREATED',
        sourceId: sourceId as EARS.EntityId,
        targetId: targetId as EARS.EntityId,
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
      }
    },
    // Add more states as needed
  }
});