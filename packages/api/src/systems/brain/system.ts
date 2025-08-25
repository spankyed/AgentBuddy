import { assign, setup, enqueueActions } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents,  } from '@/core/utils/actor-helpers';
import { EARS } from '@/core/types';
import { z } from 'zod';
import type { FlowTNodeData, TNodeEntity, TNodeUpdate } from './types';
import { repository } from '@/repository';
import { createLogger } from '@/core/utils/debug/logger';
import { createFlowNodeSystem } from './flow-system';
import { settings } from '../settings/system';
import { setBrainDebugEnabled, isBrainDebugEnabled } from './utils/brain-debug';

const typeOf = safeEvents<ReceivableEvents>();
const logger = createLogger('brain');

export const brain = 'brain' as const;
export const brainBus = 'brain-bus' as const;

const busEvent = systemBus(brain);

export const IncomingBrainEvents = [
  busEvent('OPEN_TNODE', { tNodeId: z.string() }),
  busEvent('GO_BACK_TNODE', {}),
  busEvent('REQUEST_PLUGIN_DATA', {}),
  busEvent('GET_TNODE_DETAILS', { tNodeId: z.string() }),
  busEvent('TOGGLE_DEBUG', {}),
  busEvent('START_BRAIN', {}),
  busEvent('KILL_BRAIN', {}),
  busEvent('RESTART_BRAIN', {}),
] as const

export type BrainInternalEvents = 
  | SystemEvents
  // | { type: 'TRACE_EVENT_RECEIVED'; data: EventReceived }
  | { type: 'TRIGGER_BRAIN_EVENT'; eventType: string; payload?: any }
  | { type: 'TNODE_SPAWNED'; tNode: TNodeEntity; parentId?: EARS.EntityId; eventTNodeId?: EARS.EntityId; flowTNodeId: EARS.EntityId }
  | { type: 'TNODE_UPDATED'; data: TNodeUpdate }
  | { type: 'BRAIN_SETTINGS_UPDATED'; settings: any; changes?: any }

export type OutgoingBrainEvents =
  | { type: 'RECEIVE_PLUGIN_DATA'; data: FlowTNodeData }
  // | { type: 'BRAIN_STARTUP'; data: FlowTNodeData }
  | { type: 'TNODE_OPENED'; tNodeId: EARS.EntityId; data: FlowTNodeData }
  | { type: 'TNODE_SPAWNED'; tNode: TNodeEntity; parentId?: EARS.EntityId; eventTNodeId?: EARS.EntityId; flowTNodeId: EARS.EntityId }
  | { type: 'TNODE_UPDATED'; data: TNodeUpdate }
  | { type: 'EVENT_PULSE'; eventType: string }
  | { type: 'TNODE_DETAILS'; tNodeId: EARS.EntityId; details: TNodeEntity | null }
  | { type: 'DEBUG_TOGGLED'; enabled: boolean }
  | { type: 'BRAIN_KILLED' }
  | { type: 'BRAIN_STARTED' }

export const BrainSystemEvents = fromSystem(IncomingBrainEvents)<OutgoingBrainEvents, typeof brain>()
type ReceivableEvents = MergeReceivable<typeof IncomingBrainEvents, BrainInternalEvents>;

export const brainSystem = setup({
  types: {
    context: {} as {
      brainActor?: any; // Reference to the spawned brain flow actor
    },
    events: {} as ReceivableEvents,
  },
  actions: {
    handleAppStartup: ({ system, self }) => {
      // Get initial data to check available flows
      const flowsData = repository.flowsQueries.startupData();
      const allFlows = flowsData.flows;
      
      // Check if any flow has the root_flow role
      const currentRootFlowId = repository.flowsQueries.rootFlow();
      let flowsSettings = repository.settingsQueries.getPluginSettings('flows') || {};
      
      // Initialize root flow if none exists
      if (!currentRootFlowId && allFlows.length > 0) {
        // No root flow exists, set the first available flow as root
        const firstFlow = allFlows[0];
        if (firstFlow.id) {
          repository.flowsCommands.grantRootFlowRole(firstFlow.id as EARS.EntityId);
          
          // Update flows settings to reflect this
          repository.settingsCommands.updateSettings('plugin', 'flows', ['rootFlowId'], firstFlow.id);
          flowsSettings = { ...flowsSettings, rootFlowId: firstFlow.id };
          
          logger.info('Initialized first flow as root flow', { flowId: firstFlow.id });
        }
      } else if (currentRootFlowId && flowsSettings.rootFlowId !== currentRootFlowId) {
        // Root flow exists but settings don't match, update settings
        repository.settingsCommands.updateSettings('plugin', 'flows', ['rootFlowId'], currentRootFlowId);
        flowsSettings = { ...flowsSettings, rootFlowId: currentRootFlowId };
        
        logger.info('Updated settings to reflect actual root flow', { flowId: currentRootFlowId });
      }
      
      logger.info('Brain system starting', { 
        rootFlow: flowsSettings.rootFlowId,
        totalFlows: allFlows.length
      });
    },
    
    logError: ({ event }) => {
      // console.error('Brain system error:', typeOf('ERROR', event).error);
    },
    startBrain: enqueueActions(({ context, enqueue, system }) => {
      // Stop existing brain if any using enqueue.stopChild
      if (context.brainActor) {
        enqueue.stopChild(context.brainActor);
      }
      
      // Get the current root flow ID
      const currentRootFlowId = repository.flowsQueries.rootFlow();
      
      // Update brain settings to track which flow is running via settings system
      if (currentRootFlowId) {
        getActor(system, 'settings').send({
          type: 'UPDATE_SETTINGS',
          entityType: 'plugin',
          label: 'brain',
          path: ['runningRootFlowId'],
          value: currentRootFlowId
        });
      }
      
      // Start new brain and assign to context
      enqueue.assign(({ spawn, system }) => {
        const { machine, tNodeId } = createFlowNodeSystem()
        const actor = spawn(machine, {
          systemId: brainBus, // aka root flow
          input: {}
        });
        
        logger.info('Started brain root flow', { flowId: currentRootFlowId });
        
        // Return the updated context with the actor reference
        return {
          brainActor: actor
        };
      });
      
      // Send plugin data after brain is started
      enqueue(({ system, context }) => {
        const data = repository.brainQueries.rootData();
        
        system.get(bus).send(emit(brain, { 
          type: 'RECEIVE_PLUGIN_DATA',
          data
        }));
        
        // Send current brain state
        if (context.brainActor) {
          system.get(bus).send(emit(brain, { 
            type: 'BRAIN_STARTED'
          }));
        }
      });
    }),
    
    killBrain: enqueueActions(({ context, enqueue, system }) => {
      if (context.brainActor) {
        enqueue.stopChild(context.brainActor);
        enqueue.assign({ brainActor: undefined });
        
        // Clear all volatile TNode data
        repository.brainCommands.clearVolatileData();
        
        // Clear the runningRootFlowId setting via settings system
        getActor(system, 'settings').send({
          type: 'UPDATE_SETTINGS',
          entityType: 'plugin',
          label: 'brain',
          path: ['runningRootFlowId'],
          value: undefined
        });
        
        // Send empty data to clear the UI

        system.get(bus).send(emit(brain, { 
          type: 'RECEIVE_PLUGIN_DATA',
          data: {
            flowTNodeId: '' as EARS.EntityId,
            tNodeTree: [],
            possibleEvents: [],
          }
        }));
        
        // Send BRAIN_KILLED event
        system.get(bus).send(emit(brain, {
            type: 'BRAIN_KILLED'
        }));
        
        logger.info('Brain flow machine killed and volatile data cleared');
      }
    }),
    
    restartBrain: enqueueActions(({ context, enqueue, system }) => {
      logger.info('Restarting brain flow machine');
      
      // Kill existing brain using enqueue.stopChild
      if (context.brainActor) {
        enqueue.stopChild(context.brainActor);
      }
      
      // Clear all volatile TNode data
      repository.brainCommands.clearVolatileData();
      
      // Send empty data to clear the UI temporarily
      system.get(bus).send(emit(brain, {
        type: 'RECEIVE_PLUGIN_DATA',
        data: {
          flowTNodeId: '' as EARS.EntityId,
          tNodeTree: [],
          possibleEvents: [],
        }
      }));
      
      // Get the current root flow ID
      const currentRootFlowId = repository.flowsQueries.rootFlow();
      
      // Update brain settings to track which flow is running via settings system
      if (currentRootFlowId) {
        getActor(system, 'settings').send({
          type: 'UPDATE_SETTINGS',
          entityType: 'plugin',
          label: 'brain',
          path: ['runningRootFlowId'],
          value: currentRootFlowId
        });
      }
      
      // Start new brain and assign to context
      enqueue.assign(({ spawn, system }) => {
        const { machine, tNodeId } = createFlowNodeSystem(undefined, undefined, undefined)
        const actor = spawn(machine, {
          systemId: brainBus,
          input: {}
        });
        
        // Send fresh data after starting new brain
        const data = repository.brainQueries.rootData();
        system.get(bus).send(emit(brain, { 
          type: 'RECEIVE_PLUGIN_DATA',
          data
        }));
        
        // Send BRAIN_STARTED event
        system.get(bus).send(emit(brain, { 
          type: 'BRAIN_STARTED'
        }));
        
        logger.info('Restarted brain with root flow', { flowId: currentRootFlowId });
        
        return {
          brainActor: actor
        };
      });
    }),
    sendPluginData: ({ system, context }) => {
      const data = repository.brainQueries.rootData();
      
      system.get(bus).send(emit(brain, { 
        type: 'RECEIVE_PLUGIN_DATA',
        data
      }));
      
      // Send current brain state
      if (context.brainActor) {
        system.get(bus).send(emit(brain, { 
          type: 'BRAIN_STARTED'
        }));
      } else {
        system.get(bus).send(emit(brain, { 
          type: 'BRAIN_KILLED'
        }));
      }
    },
    openTNode: ({ system, event, context }) => {
      const ev = typeOf('OPEN_TNODE', event);
      const tNodeId = ev.tNodeId as EARS.EntityId;
      
      // Check if this is a flow TNode before trying to get extended data
      const tNode = repository.brainQueries.tNodeById(tNodeId);
      if (!tNode || tNode.tNodeType !== 'flow') {
        // Silently ignore non-flow TNodes
        return;
      }
      
      const data = repository.brainQueries.extendedTNodeData(tNodeId);
      
      system.get(bus).send(emit(brain, {
        type: 'TNODE_OPENED',
        tNodeId,
        data
      }));
    },
    goBackTNode: ({ system, context }) => {
      const data = repository.brainQueries.rootData();
      
      system.get(bus).send(emit(brain, {
        type: 'TNODE_OPENED',
        tNodeId: data.flowTNodeId,
        data
      }));
    },
    getTNodeDetails: ({ system, event }) => {
      const ev = typeOf('GET_TNODE_DETAILS', event);
      const tNodeId = ev.tNodeId as EARS.EntityId;
      
      const tNode = repository.brainQueries.tNodeById(tNodeId);
      
      system.get(bus).send(emit(brain, {
        type: 'TNODE_DETAILS',
        tNodeId,
        details: tNode
      }));
    },
    toggleDebug: ({ system }) => {
      const currentState = isBrainDebugEnabled();
      const newState = !currentState;
      setBrainDebugEnabled(newState);
      
      // Send confirmation back to frontend
      system.get(bus).send(emit(brain, {
        type: 'DEBUG_TOGGLED',
        enabled: newState
      }));
    },
    triggerBrainEvent: ({ system, event, context }) => {
      const ev = typeOf('TRIGGER_BRAIN_EVENT', event);
      const { eventType, payload } = ev;
      // const brainActor = getActor(system, brainBus);
      const brainActor = system.get(brainBus);

      // Pulse the event in UI
      system.get(bus).send(emit(brain, {
        type: 'EVENT_PULSE',
        eventType: eventType
      }));

      if (brainActor && brainActor.send) {
        brainActor.send({
          type: eventType,
          payload
        });
      } else {
        console.error(`Brain actor is not available or has terminated. Cannot send event: ${eventType}`);
      }
    },
    // handleEventReceived: ({ system, event, context }) => {
    //   if (event.type === 'TRACE_EVENT_RECEIVED') {
    //     // Pulse the event in UI
    //     system.get(bus).send(emit(brain, {
    //       type: 'EVENT_PULSE',
    //       eventType: event.data.eventType
    //     }));

    //     // Forward event to brain runner
    //     system.get(brainBus).send({
    //       type: event.data.eventType,
    //       payload: event.data.payload
    //     });
    //   }
    // },
  },
}).createMachine(
  {
    id: brain,
    initial: 'running',
    context: ({ input }) => ({
      brainActor: undefined
    }),
    entry: ['handleAppStartup'],
    on: {
      CLIENT_CONNECTED: {
        actions: 'sendPluginData',
      },
      REQUEST_PLUGIN_DATA: {
        actions: 'sendPluginData',
      },
      ERROR: {
        actions: 'logError',
      },
    },
    states: {
      stopped: {
        on: {
          START_BRAIN: {
            target: 'running',
          },
          RESTART_BRAIN: {
            target: 'running',
          },
        }
      },
      running: {
        entry: ['startBrain'],
        on: {
          OPEN_TNODE: {
            actions: 'openTNode',
          },
          GO_BACK_TNODE: {
            actions: 'goBackTNode',
          },
          GET_TNODE_DETAILS: {
            actions: 'getTNodeDetails',
          },
          TOGGLE_DEBUG: {
            actions: 'toggleDebug',
          },
          KILL_BRAIN: {
            actions: 'killBrain',
            target: 'stopped',
          },
          RESTART_BRAIN: {
            actions: 'restartBrain',
          },
          // TRACE_EVENT_RECEIVED: {
          //   actions: 'handleEventReceived',
          // },
          TRIGGER_BRAIN_EVENT: {
            actions: 'triggerBrainEvent',
          },
          TNODE_SPAWNED: {
            actions: ({ system, event }) => {
              // Forward to frontend
              system.get(bus).send(emit(brain, event));
            }
          },
          TNODE_UPDATED: {
            actions: ({ system, event }) => {
              // Forward to frontend
              system.get(bus).send(emit(brain, event));
            }
          },
        },
      }
    },
  }
);
