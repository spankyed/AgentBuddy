import type { BrainSettings } from '@/__generated__/types';
import { broadcastToPlugin } from '@/__generated__/events';
import { assign, setup, enqueueActions, raise } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';

import { EARS } from '@/__generated__/ears';
import type { Contract } from './contract.ts';
import type { BrainContext, FlowTNodeData, TNodeUpdate } from './types.ts';
import { repository } from '@/__generated__/repository';
import { createLogger, reportError, setDebugEnabled, isDebugEnabled } from '@abuddy/sdk/logger';
import { createFlowNodeSystem, getFlowActor, getAllFlowActors, getAllFlowActorIds, clearFlowActorRegistry } from './flow-system';
import { setBrainPausedState } from './utils/brain-pause';
import { notify as notifyAdHocListeners, removeAllListeners as removeAllAdHocListeners } from './services/brain';
import { services } from '@/__generated__/services';
import type { StepRuntimeError, TNodeEntity } from '@abuddy/sdk/steps';
import { ref } from '@/__generated__/ref';


export const brainSpec = defineSystem<Contract>();
export const brainRuntime = 'brain-runtime' as const;

const logger = createLogger('brain');

/**
 * The flow the brain runs: the flow with the root role. Undefined when there's nothing to run, and the brain stops:
 * no flows yet, or flows without a root flow (`noRootFlowError`; the brain never picks one).
 */
const rootFlowToRun = (): EARS.EntityId | undefined => repository.flowsQueries.rootFlow();

/** The error the brain can't start with: flows exist but none has the root role. Undefined with a root flow or no flows */
function noRootFlowError(): Error | undefined {
  if (repository.flowsQueries.rootFlow()) return undefined;
  const flowCount = repository.flowsQueries.connectedData().flows.length;
  if (flowCount === 0) return undefined;
  return new Error(`No flow has the root role (${flowCount} flows exist): mark one \`root: true\` in its flow source, or make one the root flow in Flows`);
}

function reportStartError(error: Error) {
  reportError({ error, title: 'Could not start the brain', source: 'brain', operation: 'start' });
}

/**
 * A start found no flow to run: clears the running root flow and tells clients the brain is stopped, and why when
 * flows exist but none is the root. That error is reported now if a client is connected, else when one connects.
 * Returns the context the brain stays stopped with.
 */
function stopWithoutRootFlow({ clientConnected }: BrainContext): Partial<BrainContext> {
  const startError = noRootFlowError();
  if (!startError) logger.warn('No flow to run; start the brain once a flow exists');
  else if (clientConnected) reportStartError(startError);
  broadcastToPlugin('brain', { type: 'BRAIN_KILLED', startError: startError?.message });
  return { brainActor: undefined, runningRootFlowId: undefined, startError, startErrorReported: clientConnected };
}

export const brainSystem = setup({
  types: brainSpec.types,
  actions: {
    logError: ({ event }) => {
      logger.error('Brain system error', { error: (event as any).error });
    },
    startBrain: enqueueActions(({ context, enqueue, system }) => {
      // Defensive: clear stale flow actor references before starting new brain.
      // restartBrain/killBrain already do this, but startBrain must also guard
      // against leaks from lifecycle paths that bypass those actions.
      clearFlowActorRegistry();

      // Stop existing brain if any using enqueue.stopChild
      if (context.brainActor) {
        enqueue.stopChild(context.brainActor);
      }
      
      // Starts unpaused (a pause from an earlier run doesn't carry over)
      setBrainPausedState(false);

      const currentRootFlowId = rootFlowToRun();
      // Nothing to run: `running` leaves for `stopped` without a brain actor
      if (!currentRootFlowId) {
        enqueue.assign(stopWithoutRootFlow(context));
        return;
      }


      // Start new brain and assign to context
      enqueue.assign(({ spawn, self }) => {
        const { machine, tNodeId } = createFlowNodeSystem(self)
        const actor = spawn(machine, {
          input: {}
        });
        
        logger.info('Started brain root flow', { flowId: currentRootFlowId });
        
        // Return the updated context with the actor reference
        return {
          brainActor: actor,
          runningRootFlowId: currentRootFlowId,
          startError: undefined,
        };
      });
      
      // Send BRAIN_STARTED before plugin data so frontend resets brainIsDead before processing data
      enqueue(({ system, context }) => {
        // Send current brain state first
        if (context.brainActor && context.runningRootFlowId) {
          broadcastToPlugin('brain', {
            type: 'BRAIN_STARTED',
            rootFlowId: context.runningRootFlowId,
          });
        }

        const data = repository.brainQueries.rootData();

        broadcastToPlugin('brain', {
          type: 'RECEIVE_PLUGIN_DATA',
          data
        });
      });
    }),
    
    setClientConnected: assign({ clientConnected: true }),

    /** A client connected while the brain is stopped: it stays stopped with its start error unless a root flow exists by now */
    refreshStartError: assign({
      startError: ({ context }) => context.startError && noRootFlowError(),
    }),

    /** Report why the brain couldn't start, if no client was told yet: a start before any client connected */
    reportStartError: enqueueActions(({ context, enqueue }) => {
      if (!context.startError || context.startErrorReported) return;
      reportStartError(context.startError);
      enqueue.assign({ startErrorReported: true });
    }),

    killBrain: enqueueActions(({ context, enqueue, system }) => {
      if (context.brainActor) {
        setBrainPausedState(false);
        enqueue.stopChild(context.brainActor);
        enqueue.assign({ brainActor: undefined, runningRootFlowId: undefined, eventQueue: [] });

        // Clear all volatile TNode data
        repository.brainCommands.clearVolatileData();

        // Clear all ad-hoc brain event listeners
        removeAllAdHocListeners();

        // Clear all cron schedules
        services.scheduler.clearAllSchedules();

        // Defensive: drop any lingering flow actor references. Exit actions
        // on the stopped actor should unregister themselves, but if pending
        // async work interrupted that path, stale entries would leak here.
        clearFlowActorRegistry();

        // Send BRAIN_KILLED event
        broadcastToPlugin('brain', {
            type: 'BRAIN_KILLED'
        });
        
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

      // Clear all cron schedules
      services.scheduler.clearAllSchedules();

      // Defensive: drop any lingering flow actor references. Exit actions
      // on the stopped actor should unregister themselves, but if pending
      // async work interrupted that path, stale entries would leak here.
      clearFlowActorRegistry();

      // Send empty data to clear the UI temporarily
      broadcastToPlugin('brain', {
        type: 'RECEIVE_PLUGIN_DATA',
        data: {
          flowTNodeId: '' as EARS.EntityId,
          tNodeTree: [],
          possibleEvents: [],
          flowHierarchy: [],
        }
      });
      
      const currentRootFlowId = rootFlowToRun();
      // Nothing to run: `running` leaves for `stopped` without a brain actor
      if (!currentRootFlowId) {
        enqueue.assign(stopWithoutRootFlow(context));
        return;
      }

      
      // Start new brain and assign to context
      enqueue.assign(({ spawn, self }) => {
        const { machine, tNodeId } = createFlowNodeSystem(self)
        const actor = spawn(machine, {
          input: {}
        });
        
        // Send fresh data after starting new brain
        const data = repository.brainQueries.rootData();
        broadcastToPlugin('brain', { 
          type: 'RECEIVE_PLUGIN_DATA',
          data
        });
        
        // Send BRAIN_STARTED event
        broadcastToPlugin('brain', { 
          type: 'BRAIN_STARTED',
          rootFlowId: currentRootFlowId,
        });
        
        logger.info('Restarted brain with root flow', { flowId: currentRootFlowId });
        
        return {
          brainActor: actor,
          runningRootFlowId: currentRootFlowId,
          startError: undefined,
        };
      });
    }),
    sendPluginData: ({ system, context, event, self }) => {
      // Use provided flowTNodeId or fall back to root
      const flowId = event.type === 'REQUEST_PLUGIN_DATA' && event.flowTNodeId
        ? event.flowTNodeId as EARS.EntityId<'TNode'>
        : undefined;

      let data: FlowTNodeData;
      try {
        data = flowId
          ? repository.brainQueries.extendedTNodeData(flowId)
          : repository.brainQueries.rootData();
      } catch {
        // TNode was destroyed (e.g., volatile data cleared after brain kill)
        data = { flowTNodeId: '' as EARS.EntityId, tNodeTree: [], possibleEvents: [], flowHierarchy: [] };
      }

      broadcastToPlugin('brain', {
        type: 'RECEIVE_PLUGIN_DATA',
        data
      });

      // Send current brain state
      if (context.brainActor && context.runningRootFlowId) {
        broadcastToPlugin('brain', {
          type: 'BRAIN_STARTED',
          rootFlowId: context.runningRootFlowId,
        });
      } else {
        broadcastToPlugin('brain', {
          type: 'BRAIN_KILLED',
          startError: context.startError?.message,
        });
      }

      // Sync pause state
      const snapshot = self.getSnapshot();
      if (snapshot.matches({ running: 'paused' })) {
        broadcastToPlugin('brain', { type: 'BRAIN_PAUSED' });
      }

      // Restore inspect state from persisted settings. Default ON in dev so
      // switch/action/flow transitions are visible out of the box; the
      // persisted setting wins once the user has toggled it.
      const brainSettings = services.settings.forFeature<BrainSettings>(ref('brain'));
      const inspectEnabled = brainSettings?.inspectEnabled ?? (process.env.NODE_ENV !== 'production');
      setDebugEnabled('brain', inspectEnabled);
      broadcastToPlugin('brain', { type: 'INSPECT_TOGGLED', enabled: inspectEnabled });
    },
    openTNode: ({ system, event, context }) => {
      const ev = brainSpec.typeOf('OPEN_TNODE', event);
      const tNodeId = ev.tNodeId as EARS.EntityId<'TNode'>;

      // Check if this is a flow TNode before trying to get extended data
      const tNode = repository.brainQueries.tNodeById(tNodeId);
      if (!tNode || tNode.tNodeType !== 'flow') {
        // Silently ignore non-flow TNodes
        return;
      }

      const data = repository.brainQueries.extendedTNodeData(tNodeId);

      broadcastToPlugin('brain', {
        type: 'TNODE_OPENED',
        tNodeId,
        data
      });
    },
    goBackTNode: ({ system, event }) => {
      const currentFlowTNodeId = brainSpec.typeOf('GO_BACK_TNODE', event).currentFlowTNodeId as EARS.EntityId<'TNode'> | undefined;
      const parentFlowTNodeId = currentFlowTNodeId
        ? repository.brainQueries.tNodeById(currentFlowTNodeId)?.nodeAttributes?._parentFlowTNodeId as EARS.EntityId<'TNode'> | undefined
        : undefined;

      const data = parentFlowTNodeId
        ? repository.brainQueries.extendedTNodeData(parentFlowTNodeId)
        : repository.brainQueries.rootData();

      broadcastToPlugin('brain', {
        type: 'TNODE_OPENED',
        tNodeId: data.flowTNodeId,
        data
      });
    },
    getTNodeDetails: ({ system, event }) => {
      const ev = brainSpec.typeOf('GET_TNODE_DETAILS', event);
      const tNodeId = ev.tNodeId as EARS.EntityId<'TNode'>;
      
      const tNode = repository.brainQueries.tNodeById(tNodeId);
      
      broadcastToPlugin('brain', {
        type: 'TNODE_DETAILS',
        tNodeId,
        details: tNode
      });
    },
    toggleInspect: ({ system }) => {
      const currentState = isDebugEnabled('brain');
      const newState = !currentState;
      setDebugEnabled('brain', newState);

      // Persist to settings DB
      services.settings.setForFeature(ref('brain'), ['inspectEnabled'], newState);

      // Send confirmation back to frontend
      broadcastToPlugin('brain', {
        type: 'INSPECT_TOGGLED',
        enabled: newState
      });
    },
    queueBrainEvent: assign(({ context, event }) => {
      const ev = brainSpec.typeOf(['TRIGGER_BRAIN_EVENT', 'HANDLE_BRAIN_EVENT'], event);
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
        }, { delay: 0 });
      }
      enqueue.assign({ eventQueue: [] });
    }),
    triggerBrainEvent: ({ system, event, context }) => {
      const ev = brainSpec.typeOf(['TRIGGER_BRAIN_EVENT', 'HANDLE_BRAIN_EVENT'], event);
      const { eventType, payload, targetFlowId } = ev;

      // Pulse the event in UI
      broadcastToPlugin('brain', {
        type: 'EVENT_PULSE',
        eventType: eventType
      });

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
    id: 'brain',
    initial: 'running',
    context: ({ input }) => ({
      brainActor: undefined,
      eventQueue: [],
      startErrorReported: false,
      clientConnected: false,
    }),
    on: {
      CLIENT_CONNECTED: {
        actions: ['setClientConnected', 'sendPluginData'],
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
          CLIENT_CONNECTED: {
            actions: ['setClientConnected', 'refreshStartError', 'sendPluginData', 'reportStartError'],
          },
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
        // Started (or restarted) with no flow to run
        always: { guard: ({ context }) => context.brainActor === undefined, target: 'stopped' },
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
          CHILD_COMPLETED: {
            actions: 'killBrain',
            target: 'stopped',
          },
          TNODE_SPAWNED: {
            actions: ({ system, event }) => {
              // Forward to frontend
              broadcastToPlugin('brain', event);
            }
          },
          TNODE_UPDATED: {
            actions: ({ system, event }) => {
              // Forward to frontend
              broadcastToPlugin('brain', event);
            }
          },
        },
        states: {
          active: {
            on: {
              TRIGGER_BRAIN_EVENT: {
                actions: raise(({ event }) => ({
                  ...brainSpec.typeOf('TRIGGER_BRAIN_EVENT', event),
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
                  broadcastToPlugin('brain', { type: 'BRAIN_PAUSED' });
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
                    broadcastToPlugin('brain', { type: 'BRAIN_RESUMED' });
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

const brainEntry = { spec: brainSpec, machine: brainSystem };

export default brainEntry;
