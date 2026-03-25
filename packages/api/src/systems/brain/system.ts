import { assign, setup, enqueueActions, raise } from 'xstate';
import type { MergeReceivable } from '@/core/helpers/event-helpers';
import { fromSystem, systemBus } from '@/core/helpers/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents,  } from '@/core/helpers/actor-helpers';
import { EARS } from '@/core/types';
import { z } from 'zod';
import type { FlowTNodeData, TNodeEntity, TNodeUpdate } from './types';
import { repository } from '@/repository';
import { createLogger } from '@/core/helpers/debug/logger';
import { createFlowNodeSystem, getFlowActor, getAllFlowActors, getAllFlowActorIds } from './flow-system';
import { settings } from '../settings/system';
import { setBrainInspectEnabled, isBrainInspectEnabled } from './utils/brain-inspect';
import { setBrainPausedState } from './utils/brain-pause';
import { notify as notifyAdHocListeners, removeAllListeners as removeAllAdHocListeners } from '@/services/brain';

const typeOf = safeEvents<ReceivableEvents>();
const logger = createLogger('brain');

export const brain = 'brain' as const;
export const brainBus = 'brain-bus' as const;

const busEvent = systemBus(brain);

export const IncomingBrainEvents = [
  busEvent('OPEN_TNODE', { tNodeId: z.string() }),
  busEvent('GO_BACK_TNODE', { currentFlowTNodeId: z.string().optional() }),
  busEvent('REQUEST_PLUGIN_DATA', { flowTNodeId: z.string().optional() }),
  busEvent('GET_TNODE_DETAILS', { tNodeId: z.string() }),
  busEvent('TOGGLE_INSPECT', {}),
  busEvent('START_BRAIN', {}),
  busEvent('KILL_BRAIN', {}),
  busEvent('RESTART_BRAIN', {}),
  busEvent('PAUSE_BRAIN', {}),
  busEvent('RESUME_BRAIN', {}),
  busEvent('HANDLE_BRAIN_EVENT', {
    eventType: z.string(),
    payload: z.any().optional(),
    targetFlowId: z.string().optional()
  }),
  busEvent('TRIGGER_BRAIN_EVENT', {
    eventType: z.string(),
    payload: z.any().optional(),
    targetFlowId: z.string().optional()
  }),
] as const

export type BrainInternalEvents =
  | SystemEvents
  // | { type: 'TRACE_EVENT_RECEIVED'; data: EventReceived }
  | { type: 'TNODE_SPAWNED'; tNode: TNodeEntity; parentId?: EARS.EntityId; eventTNodeId?: EARS.EntityId; flowTNodeId: EARS.EntityId }
  | { type: 'TNODE_UPDATED'; data: TNodeUpdate }
  | { type: 'BRAIN_SETTINGS_UPDATED'; settings: any; changes?: any }

export type OutgoingBrainEvents =
  | { type: 'RECEIVE_PLUGIN_DATA'; data: FlowTNodeData }
  // | { type: 'BRAIN_CONNECTED'; data: FlowTNodeData }
  | { type: 'TNODE_OPENED'; tNodeId: EARS.EntityId; data: FlowTNodeData }
  | { type: 'TNODE_SPAWNED'; tNode: TNodeEntity; parentId?: EARS.EntityId; eventTNodeId?: EARS.EntityId; flowTNodeId: EARS.EntityId }
  | { type: 'TNODE_UPDATED'; data: TNodeUpdate }
  | { type: 'EVENT_PULSE'; eventType: string }
  | { type: 'TNODE_DETAILS'; tNodeId: EARS.EntityId; details: TNodeEntity | null }
  | { type: 'INSPECT_TOGGLED'; enabled: boolean }
  | { type: 'BRAIN_KILLED' }
  | { type: 'BRAIN_STARTED' }
  | { type: 'BRAIN_PAUSED' }
  | { type: 'BRAIN_RESUMED' }

export const BrainSystemEvents = fromSystem(IncomingBrainEvents)<OutgoingBrainEvents, typeof brain>()
type ReceivableEvents = MergeReceivable<typeof IncomingBrainEvents, BrainInternalEvents>;

export const brainSystem = setup({
  types: {
    context: {} as {
      brainActor?: any; // Reference to the spawned brain flow actor
      eventQueue: Array<{ eventType: string; payload?: any; targetFlowId?: string }>;
    },
    events: {} as ReceivableEvents,
  },
  actions: {
    handleAppStartup: ({ system, self }) => {
      // Get initial data to check available flows
      const flowsData = repository.flowsQueries.connectedData();
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
        setBrainPausedState(false);
        enqueue.stopChild(context.brainActor);
        enqueue.assign({ brainActor: undefined, eventQueue: [] });

        // Clear all volatile TNode data
        repository.brainCommands.clearVolatileData();

        // Clear all ad-hoc brain event listeners
        removeAllAdHocListeners();

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
            flowHierarchy: [],
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

      setBrainPausedState(false);

      // Clear event queue
      enqueue.assign({ eventQueue: [] });

      // Kill existing brain using enqueue.stopChild
      if (context.brainActor) {
        enqueue.stopChild(context.brainActor);
      }

      // Clear all volatile TNode data
      repository.brainCommands.clearVolatileData();

      // Clear all ad-hoc brain event listeners
      removeAllAdHocListeners();

      // Send empty data to clear the UI temporarily
      system.get(bus).send(emit(brain, {
        type: 'RECEIVE_PLUGIN_DATA',
        data: {
          flowTNodeId: '' as EARS.EntityId,
          tNodeTree: [],
          possibleEvents: [],
          flowHierarchy: [],
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
    sendPluginData: ({ system, context, event, self }) => {
      // Use provided flowTNodeId or fall back to root
      const flowId = event.type === 'REQUEST_PLUGIN_DATA' && event.flowTNodeId
        ? event.flowTNodeId as EARS.EntityId
        : undefined;

      const data = flowId
        ? repository.brainQueries.extendedTNodeData(flowId)
        : repository.brainQueries.rootData();

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

      // Sync pause state
      const snapshot = self.getSnapshot();
      if (snapshot.matches({ running: 'paused' })) {
        system.get(bus).send(emit(brain, { type: 'BRAIN_PAUSED' }));
      }

      // Restore inspect state from persisted settings
      const brainSettings = repository.settingsQueries.getPluginSettings('brain');
      const inspectEnabled = brainSettings?.inspectEnabled ?? false;
      setBrainInspectEnabled(inspectEnabled);
      system.get(bus).send(emit(brain, { type: 'INSPECT_TOGGLED', enabled: inspectEnabled }));
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
    goBackTNode: ({ system, event }) => {
      const currentFlowTNodeId = typeOf('GO_BACK_TNODE', event).currentFlowTNodeId as EARS.EntityId | undefined;
      const parentFlowTNodeId = currentFlowTNodeId
        ? repository.brainQueries.tNodeById(currentFlowTNodeId)?.nodeAttributes?._parentFlowTNodeId as EARS.EntityId | undefined
        : undefined;

      const data = parentFlowTNodeId
        ? repository.brainQueries.extendedTNodeData(parentFlowTNodeId)
        : repository.brainQueries.rootData();

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
    toggleInspect: ({ system }) => {
      const currentState = isBrainInspectEnabled();
      const newState = !currentState;
      setBrainInspectEnabled(newState);

      // Persist to settings DB
      repository.settingsCommands.updateSettings('plugin', 'brain', ['inspectEnabled'], newState);

      // Send confirmation back to frontend
      system.get(bus).send(emit(brain, {
        type: 'INSPECT_TOGGLED',
        enabled: newState
      }));
    },
    queueBrainEvent: assign(({ context, event }) => {
      const ev = typeOf(['TRIGGER_BRAIN_EVENT', 'HANDLE_BRAIN_EVENT'], event);
      return {
        eventQueue: [...context.eventQueue, { eventType: ev.eventType, payload: ev.payload, targetFlowId: ev.targetFlowId }]
      };
    }),
    replayQueuedEvents: enqueueActions(({ context, enqueue }) => {
      for (const queuedEvent of context.eventQueue) {
        enqueue.raise({
          type: 'HANDLE_BRAIN_EVENT',
          eventType: queuedEvent.eventType,
          payload: queuedEvent.payload,
          targetFlowId: queuedEvent.targetFlowId,
        } as any, { delay: 0 });
      }
      enqueue.assign({ eventQueue: [] });
    }),
    triggerBrainEvent: ({ system, event, context }) => {
      const ev = typeOf(['TRIGGER_BRAIN_EVENT', 'HANDLE_BRAIN_EVENT'], event);
      const { eventType, payload, targetFlowId } = ev;

      // Pulse the event in UI
      system.get(bus).send(emit(brain, {
        type: 'EVENT_PULSE',
        eventType: eventType
      }));

      // Handle local vs global events
      if (targetFlowId) {
        // LOCAL EVENT: Send to specific flow only
        const targetActor = getFlowActor(targetFlowId as EARS.EntityId);

        if (targetActor?.send) {
          targetActor.send({
            type: eventType,
            payload,
            targetFlowId
          });
        } else {
          logger.error(`Target flow actor not found: ${eventType}`, { targetFlowId });
        }
      } else {
        // GLOBAL EVENT: Broadcast to ALL registered flow actors
        const allFlowActors = getAllFlowActors();
        const allFlowActorIds = getAllFlowActorIds();

        if (allFlowActors.length === 0) {
          logger.warn(`No flow actors registered to receive global event: ${eventType}`);
        } else {
          logger.info(`Broadcasting global event "${eventType}" to ${allFlowActors.length} flow actors`, {
            eventType,
            actorCount: allFlowActors.length,
            flowActorIds: allFlowActorIds
          });

          // Send to all flow actors (including root and all children)
          allFlowActors.forEach(actor => {
            if (actor?.send) {
              actor.send({
                type: eventType,
                payload,
                // No targetFlowId for global events
              });
            }
          });
        }
      }

      // Notify ad-hoc listeners (after normal flow routing)
      notifyAdHocListeners(eventType, payload, targetFlowId);
    },
  },
}).createMachine(
  {
    id: brain,
    initial: 'running',
    context: ({ input }) => ({
      brainActor: undefined,
      eventQueue: [],
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
        initial: 'active',
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
          TOGGLE_INSPECT: {
            actions: 'toggleInspect',
          },
          KILL_BRAIN: {
            actions: 'killBrain',
            target: 'stopped',
          },
          RESTART_BRAIN: {
            actions: 'restartBrain',
            target: '.active',
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
        states: {
          active: {
            on: {
              TRIGGER_BRAIN_EVENT: {
                actions: raise(({ event }) => ({
                  ...typeOf('TRIGGER_BRAIN_EVENT', event),
                  type: 'HANDLE_BRAIN_EVENT',
                }), { delay: 0 }),
              },
              HANDLE_BRAIN_EVENT: {
                actions: 'triggerBrainEvent',
              },
              PAUSE_BRAIN: {
                target: 'paused',
                actions: ({ system }) => {
                  setBrainPausedState(true);
                  system.get(bus).send(emit(brain, { type: 'BRAIN_PAUSED' }));
                },
              },
            },
          },
          paused: {
            on: {
              TRIGGER_BRAIN_EVENT: {
                actions: 'queueBrainEvent',
              },
              HANDLE_BRAIN_EVENT: {
                actions: 'queueBrainEvent',
              },
              RESUME_BRAIN: {
                target: 'active',
                actions: [
                  () => {
                    setBrainPausedState(false);
                    // Resume deferred steps in all active flows
                    for (const actor of getAllFlowActors()) {
                      actor.send({ type: 'RESUME_FLOW' });
                    }
                  },
                  'replayQueuedEvents',
                  ({ system }) => {
                    system.get(bus).send(emit(brain, { type: 'BRAIN_RESUMED' }));
                  },
                ],
              },
            },
          },
        },
      }
    },
  }
);
