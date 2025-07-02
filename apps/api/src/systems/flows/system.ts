import { assign, cancel, createMachine, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import { EARS } from '@/shared/ears/types';
import flowsStartupData from './repository/startup';
import { FlowsStartupData, FlowEntity, NodeEntity } from './types';
import { getExtendedData } from './repository/read';
import { createFlow, createNode, createEdge } from './repository/create';
import { updateFlowLabel, updateNode } from './repository/update';
import { z } from 'zod';
import { createLogger } from '@/systems/logs/logger';
import { getAllPrompts } from '../prompts/repository/read';

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
  busEvent('FETCH_ALL_PROMPTS', {}),
] as const

export type FlowsInternalEvents = 
  | SystemEvents

export type OutgoingFlowsEvents =
  | { type: 'FLOWS_STARTUP'; data: FlowsStartupData }
  | { type: 'FLOW_SELECTED'; flowId: EARS.EntityId; data: { nodes: any[]; edges: any[] } }
  | { type: 'FLOW_CREATED'; flow: FlowEntity; flowId: EARS.EntityId }
  | { type: 'NODE_CREATED'; tempId: string; nodeId: EARS.EntityId; node: any }
  | { type: 'NODE_UPDATED'; nodeId: EARS.EntityId; node: any }
  | { type: 'EDGE_CREATED'; sourceId: EARS.EntityId; targetId: EARS.EntityId }
  | { type: 'ALL_PROMPTS_FETCHED'; prompts: any[] }

export const FlowsSystemEvents = fromSystem(IncomingFlowsEvents)<OutgoingFlowsEvents, typeof flows>()
type ReceivableEvents = MergeReceivable<typeof IncomingFlowsEvents, FlowsInternalEvents>;

export const flowsSystem = setup({
  types: {
    context: {} as {
      flowsId: EARS.EntityId;
    },
    events: {} as ReceivableEvents,
    input: {} as EARS.EntityId,
  },
  actions: {
    sendFlowsStartupData: ({ system }) => {
      system.get(bus).send(emit(flows, { 
        type: 'FLOWS_STARTUP',
        data: flowsStartupData()
      }));
    },
    fetchAllPrompts: ({ system }) => {
      const prompts = getAllPrompts();
      
      system.get(bus).send(emit(flows, {
        type: 'ALL_PROMPTS_FETCHED',
        prompts
      }));
    },
    sendFlowData: ({ system, event }) => {
      const ev = typeOf('FLOW_SELECT', event);
      const flow = getExtendedData(ev.flowId as EARS.EntityId);
      
      system.get(bus).send(emit(flows, {
        type: 'FLOW_SELECTED',
        flowId: ev.flowId as EARS.EntityId,
        data: flow
      }));
    },
    createFlow: ({ system }) => {
      const newFlow = createFlow();

      system.get(bus).send(emit(flows, {
        type: 'FLOW_CREATED',
        flow: newFlow,
        flowId: newFlow.id,
      }));
    },
    updateFlowLabel: ({ event }) => {
      const ev = typeOf('UPDATE_FLOW_LABEL', event);
      updateFlowLabel(ev.flowId as EARS.EntityId, ev.label);
    },
    createNode: ({ system, event }) => {
      const ev = typeOf('CREATE_NODE', event);
      logger.info('Creating node:', { flowId: ev.flowId, tempId: ev.tempId, nodeData: ev.nodeData });
      
      try {
        const newNode = createNode(ev.flowId as EARS.EntityId, ev.nodeData as Partial<NodeEntity>);
        
        system.get(bus).send(emit(flows, {
          type: 'NODE_CREATED',
          tempId: ev.tempId,
          nodeId: newNode.id,
          node: newNode,
        }));
      } catch (error) {
        logger.error('Failed to create node:', error as any);
      }
    },
    updateNode: ({ system, event }) => {
      const ev = typeOf('UPDATE_NODE', event);
      logger.info('Updating node:', { flowId: ev.flowId, nodeId: ev.nodeId, nodeData: ev.nodeData });
      
      try {
        updateNode(ev.nodeId as EARS.EntityId, ev.nodeData as Partial<NodeEntity>);
        
        system.get(bus).send(emit(flows, {
          type: 'NODE_UPDATED',
          nodeId: ev.nodeId as EARS.EntityId,
          node: ev.nodeData,
        }));
      } catch (error) {
        logger.error('Failed to update node:', error as any);
      }
    },
    createEdge: ({ system, event }) => {
      const ev = typeOf('CREATE_EDGE', event);
      logger.info('Creating edge:', { sourceId: ev.sourceId, targetId: ev.targetId });
      
      createEdge(ev.sourceId as EARS.EntityId, ev.targetId as EARS.EntityId);
      
      system.get(bus).send(emit(flows, {
        type: 'EDGE_CREATED',
        sourceId: ev.sourceId as EARS.EntityId,
        targetId: ev.targetId as EARS.EntityId,
      }));
    },
  },
}).createMachine(
  {
    id: flows,
    initial: 'idle',
    context: ({ input }) => ({
      flowsId: input,
    }),
    on: {
      FLOW_SELECT: {
        actions: 'sendFlowData',
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
      FETCH_ALL_PROMPTS: {
        actions: 'fetchAllPrompts',
      },
    },
    states: {
      idle: {
        on: {
          CLIENT_CONNECTED: {
            actions: 'sendFlowsStartupData',
          },
        },
      },
    },
  }
);
