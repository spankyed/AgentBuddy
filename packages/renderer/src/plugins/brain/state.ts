import { assign, setup, type ActorRefFrom } from 'xstate';
import { safeEvents } from '@/core/types/safe-events';
import breadcrumb, { breadcrumbList } from '@/core/breadcrumb';
import { contextMenuFn } from '@/core/context-menu';
import { Activity, Terminal, Play, RefreshCw, Power, PlayCircle, Pause } from 'lucide-vue-next';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import type {
  OutgoingBrainEvents,
} from '@app/api'
import type { BrainRuntimeError, TNodeEntity, EventListenerEntity, FlowTNodeData, TrackEntity } from '@app/api';
import { trpc } from '@/core/trpc';

export const id = 'brain';
export type BrainState = ActorRefFrom<typeof brainState>

// Normalized structure for efficient updates
interface NormalizedTNodeTree {
  byId: Record<string, TNodeEntity>;
  rootIds: string[];
  childrenById: Record<string, string[]>;
}

export interface BrainContext {
  flowTNodeId?: string;
  tNodeTree?: TrackEntity[];
  normalizedTree?: NormalizedTNodeTree;
  possibleEvents: EventListenerEntity[];
  flowHierarchy: Array<{ flowTNodeId: string; label: string }>;
  pulsingEventType?: string;
  // UI state
  showLeftPanel: boolean;
  selectedStepNode?: TNodeEntity;
  inspectEnabled: boolean;
  animationsEnabled: boolean;
  brainIsDead: boolean;
  brainIsPaused: boolean;
  latestRuntimeError?: BrainRuntimeError;
  runtimeErrors: BrainRuntimeError[];
  // Settings
  settings?: any; // BrainSettings
}

type SystemEvent = OutgoingBrainEvents
  | { type: 'TNODE_DETAILS'; tNodeId: string; details: TNodeEntity | null }
  | { type: 'INSPECT_TOGGLED'; enabled: boolean }
  | { type: 'BRAIN_SETTINGS_UPDATED'; settings: any }
  | { type: 'BRAIN_KILLED' }
  | { type: 'BRAIN_STARTED' }
  | { type: 'BRAIN_PAUSED' }
  | { type: 'BRAIN_RESUMED' }
  | { type: 'BRAIN_RUNTIME_ERROR'; error: BrainRuntimeError }

type UIEvent =
  | { type: 'NODE.CLICK'; nodeId: string }
  | { type: 'SELECT_AND_SHOW_FIRST_NODE' }
  | { type: 'FLOW.NAVIGATE'; tNodeId: string }
  | { type: 'BACK.CLICK' }
  | { type: 'EVENT.CLICK'; eventType: string }
  | { type: 'TOGGLE_LEFT_PANEL' }
  | { type: 'CLOSE_DETAILS' }
  | { type: 'TOGGLE_INSPECT' }
  | { type: 'TOGGLE_ANIMATIONS' }
  | { type: 'RESTART_BRAIN' }
  | { type: 'KILL_BRAIN' }
  | { type: 'PAUSE_BRAIN' }
  | { type: 'RESUME_BRAIN' }
  | { type: 'DISMISS_RUNTIME_ERROR' }

type PluginEvent =
  | { type: 'PLUGIN_ACTIVATED' }
  | { type: 'PLUGIN_DEACTIVATED' }

export type BrainEvents = UIEvent | SystemEvent | PluginEvent | TrailClickEvent
const typeOf = safeEvents<BrainEvents>()

// Helper functions for tree normalization
function normalizeTNodeTree(tree: TrackEntity[]): NormalizedTNodeTree {
  const normalized: NormalizedTNodeTree = {
    byId: {},
    rootIds: [],
    childrenById: {}
  };

  function processNode(node: TrackEntity, isRoot = false) {
    // Store the node without children
    const { children, ...nodeWithoutChildren } = node;
    normalized.byId[node.id] = nodeWithoutChildren as TNodeEntity;

    if (isRoot) {
      normalized.rootIds.push(node.id);
    }

    // Process children
    if (children && children.length > 0) {
      normalized.childrenById[node.id] = children.map(child => child.id);
      children.forEach(child => processNode(child, false));
    } else {
      normalized.childrenById[node.id] = [];
    }
  }

  tree.forEach(node => processNode(node, true));
  return normalized;
}

function denormalizeTNodeTree(normalized: NormalizedTNodeTree): TrackEntity[] {
  function buildNode(id: string): TrackEntity {
    const node = normalized.byId[id];
    const childIds = normalized.childrenById[id] || [];

    return {
      ...node,
      children: childIds.map(childId => buildNode(childId))
    } as TrackEntity;
  }

  return normalized.rootIds.map(id => buildNode(id));
}

const brainState = setup({
  types: {
    context: {} as BrainContext,
    events: {} as BrainEvents,
  },
  actors: {},
  actions: {
    setBrainData: assign(({ context, event }) => {
      if (context.brainIsDead) return {};
      const typedEv = typeOf('RECEIVE_PLUGIN_DATA', event);
      const normalizedTree = typedEv.data.tNodeTree ? normalizeTNodeTree(typedEv.data.tNodeTree) : undefined;
      return {
        flowTNodeId: typedEv.data.flowTNodeId,
        tNodeTree: typedEv.data.tNodeTree,
        normalizedTree,
        possibleEvents: typedEv.data.possibleEvents,
        flowHierarchy: typedEv.data.flowHierarchy || [],
      };
    }),
    setTNodeData: assign(({ event }) => {
      const typedEv = typeOf('TNODE_OPENED', event);
      const normalizedTree = typedEv.data.tNodeTree ? normalizeTNodeTree(typedEv.data.tNodeTree) : undefined;
      return {
        flowTNodeId: typedEv.data.flowTNodeId,
        tNodeTree: typedEv.data.tNodeTree,
        normalizedTree,
        possibleEvents: typedEv.data.possibleEvents,
        flowHierarchy: typedEv.data.flowHierarchy || [],
      };
    }),
    addTNodeToTree: assign(({ context, event }) => {
      if (event.type !== 'TNODE_SPAWNED') return {};

      const { tNode, parentId, eventTNodeId, flowTNodeId } = event;

      // Filter: Only accept TNode spawns for the currently viewed flow
      // This prevents subflow internal events from appearing in parent flow view
      if (flowTNodeId !== context.flowTNodeId) {
        return {};
      }

      // Event TNodes have parentId = flowTNodeId (the flow container), but the flow
      // container is NOT in the display tree. Event TNodes are root-level items in the
      // display tree (matching how eventTracks() returns them from the repository).
      const isDirectFlowChild = parentId === context.flowTNodeId;

      if (!context.normalizedTree) {
        // Initialize if not present
        return {
          normalizedTree: {
            byId: { [tNode.id]: tNode },
            rootIds: (!parentId || isDirectFlowChild) ? [tNode.id] : [],
            childrenById: { [tNode.id]: [] }
          }
        };
      }

      // Clone the normalized tree for immutability
      const newTree = {
        byId: { ...context.normalizedTree.byId },
        rootIds: [...context.normalizedTree.rootIds],
        childrenById: { ...context.normalizedTree.childrenById }
      };

      // Add the new node
      newTree.byId[tNode.id] = tNode;
      newTree.childrenById[tNode.id] = [];

      if (parentId && !isDirectFlowChild) {
        // Child of a node that's IN the display tree (e.g., step under event)
        if (!newTree.childrenById[parentId]) {
          newTree.childrenById[parentId] = [];
        } else {
          newTree.childrenById[parentId] = [...newTree.childrenById[parentId]];
        }
        newTree.childrenById[parentId].push(tNode.id);
      } else {
        // Root node: either no parent, or parent is the flow container
        newTree.rootIds.push(tNode.id);
      }

      // Update denormalized tree as well
      const denormalizedTree = denormalizeTNodeTree(newTree);

      return {
        normalizedTree: newTree,
        tNodeTree: denormalizedTree
      };
    }),
    updateTNodeInTree: assign(({ context, event }) => {
      if (event.type !== 'TNODE_UPDATED') return {};

      const { data } = event;
      const { tNodeId, status, eventTNodeId } = data;

      if (!context.normalizedTree || !context.normalizedTree.byId[tNodeId]) {
        return {};
      }

      // Clone the normalized tree
      const newTree = {
        byId: { ...context.normalizedTree.byId },
        rootIds: [...context.normalizedTree.rootIds],
        childrenById: { ...context.normalizedTree.childrenById }
      };

      // Update the node status
      newTree.byId[tNodeId] = {
        ...newTree.byId[tNodeId],
        status
      };

      // Update denormalized tree
      const denormalizedTree = denormalizeTNodeTree(newTree);

      return {
        normalizedTree: newTree,
        tNodeTree: denormalizedTree
      };
    }),
    refreshNodeDetailsIfSelected: ({ context, event }) => {
      if (event.type !== 'TNODE_UPDATED') return;

      const { tNodeId } = event.data;

      // If this is the currently selected step node, refresh its details
      if (context.selectedStepNode?.id === tNodeId) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'GET_TNODE_DETAILS',
          tNodeId
        });
      }
    },
    pulseEvent: assign(({ event }) => {
      if (event.type !== 'EVENT_PULSE') return {};
      return {
        pulsingEventType: event.eventType
      };
    }),
    clearPulse: assign({
      pulsingEventType: undefined
    }),
    navigateToFlow: ({ event }) => {
      if (event.type !== 'FLOW.NAVIGATE') return;

      trpc.bus.send.mutate({
        systemId: id,
        type: 'OPEN_TNODE',
        tNodeId: event.tNodeId
      });
    },
    goBack: ({ context }) => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GO_BACK_TNODE',
        currentFlowTNodeId: context.flowTNodeId
      });
    },
    requestPluginData: ({ context }) => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'REQUEST_PLUGIN_DATA',
        ...(context.flowTNodeId && { flowTNodeId: context.flowTNodeId })
      });
    },
    toggleLeftPanel: assign({
      showLeftPanel: ({ context }) => !context.showLeftPanel
    }),
    requestNodeDetails: assign(({ event }) => {
      if (event.type !== 'NODE.CLICK') return {};

      trpc.bus.send.mutate({
        systemId: id,
        type: 'GET_TNODE_DETAILS',
        tNodeId: event.nodeId
      });

      // Set the selected node ID immediately
      return {
        selectedStepNode: {
          id: event.nodeId
        } as any
      };
    }),

    selectAndShowFirstNode: assign(({ context }) => {
      // Get all nodes from the normalized tree
      const byId = context.normalizedTree?.byId;
      const rootIds = context.normalizedTree?.rootIds || [];

      if (!byId) {
        console.warn('No nodes available in brain');
        return {};
      }

      // Find the first node that is not a root node
      const firstNodeId = Object.keys(byId).find(id => !rootIds.includes(id));

      if (!firstNodeId) {
        console.warn('No child nodes available in brain');
        return {};
      }

      // Request details for this node
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GET_TNODE_DETAILS',
        tNodeId: firstNodeId
      });

      // Set the selected node ID immediately
      return {
        selectedStepNode: {
          id: firstNodeId
        } as any
      };
    }),
    setStepNodeDetails: assign(({ event }) => {
      if (event.type !== 'TNODE_DETAILS') return {};
      return {
        selectedStepNode: event.details || undefined
      };
    }),
    closeDetails: assign({
      selectedStepNode: undefined
    }),
    toggleInspect: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'TOGGLE_INSPECT'
      });
    },
    setInspectEnabled: assign(({ event }) => {
      if (event.type !== 'INSPECT_TOGGLED') return {};
      return {
        inspectEnabled: event.enabled
      };
    }),
    toggleAnimations: assign({
      animationsEnabled: ({ context }) => !context.animationsEnabled
    }),
    updateSettings: assign(({ event }) => {
      const typedEv = typeOf('BRAIN_SETTINGS_UPDATED', event);
      return {
        settings: typedEv.settings
      };
    }),
    setBrainKilled: assign({
      brainIsDead: true,
      brainIsPaused: false,
      possibleEvents: [],
      flowHierarchy: [],
      selectedStepNode: undefined,
    }),
    setBrainStarted: assign({
      brainIsDead: false,
      brainIsPaused: false,
    }),
    setBrainPaused: assign({
      brainIsPaused: true,
    }),
    setBrainResumed: assign({
      brainIsPaused: false,
    }),
    addRuntimeError: assign(({ context, event }) => {
      if (event.type !== 'BRAIN_RUNTIME_ERROR') return {};
      const runtimeErrors = [event.error, ...context.runtimeErrors].slice(0, 25);
      return {
        latestRuntimeError: event.error,
        runtimeErrors,
      };
    }),
    dismissRuntimeError: assign({
      latestRuntimeError: undefined,
    }),
    pauseBrain: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'PAUSE_BRAIN'
      });
    },
    resumeBrain: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'RESUME_BRAIN'
      });
    },
    restartBrain: ({ context }) => {
      trpc.bus.send.mutate({
        systemId: id,
        type: context.brainIsDead ? 'START_BRAIN' : 'RESTART_BRAIN'
      });
    },
    killBrain: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'KILL_BRAIN'
      });
    },
    handleBreadcrumbClick: ({ event, context }) => {
      const target = (event as TrailClickEvent).target;

      if (target === 'root') {
        trpc.bus.send.mutate({ systemId: id, type: 'GO_BACK_TNODE' });
      } else if (target.startsWith('flow:')) {
        const flowTNodeId = target.substring(5);
        if (flowTNodeId !== context.flowTNodeId) {
          trpc.bus.send.mutate({ systemId: id, type: 'OPEN_TNODE', tNodeId: flowTNodeId });
        }
      }
    },
  },
  guards: {
    canGoBack: ({ context }) => {
      return true;
    },
    targetIs,
  },
}).createMachine({
  id,
  context: {
    possibleEvents: [],
    flowHierarchy: [],
    showLeftPanel: false,
    inspectEnabled: false,
    animationsEnabled: true,
    selectedStepNode: undefined,
    brainIsDead: false, // Start as running to prevent flash of dead UI
    brainIsPaused: false,
    latestRuntimeError: undefined,
    runtimeErrors: [],
  },
  initial: 'loading',
  states: {
    loading: {
      on: {
        RECEIVE_PLUGIN_DATA: {
          target: 'ready',
          actions: 'setBrainData'
        },
        BRAIN_RUNTIME_ERROR: {
          actions: 'addRuntimeError'
        },
        DISMISS_RUNTIME_ERROR: {
          actions: 'dismissRuntimeError'
        }
      }
    },
    ready: {
      meta: {
        ...breadcrumbList<BrainContext>((ctx) =>
          !ctx.flowHierarchy?.length
            ? [{ label: 'Brain', target: 'root' }]
            : ctx.flowHierarchy.map((flow, i) => ({
                label: i === 0 ? 'Brain' : flow.label,
                target: `flow:${flow.flowTNodeId}`
              }))
        ),
        ...contextMenuFn<BrainContext>((ctx) => [
          { label: 'Watched Events', icon: Activity, event: { type: 'TOGGLE_LEFT_PANEL' }, isActive: ctx.showLeftPanel, iconColor: 'text-primary-400' },
          { label: 'Auto-focus Animations', icon: Play, event: { type: 'TOGGLE_ANIMATIONS' }, isActive: ctx.animationsEnabled, iconColor: 'text-blue-400' },
          ...(ctx.brainIsDead
            ? [{ separator: true, label: 'Start Brain', icon: PlayCircle, event: { type: 'RESTART_BRAIN' as const }, iconColor: 'text-green-400' }]
            : [
                ...(ctx.brainIsPaused
                  ? [{ separator: true, label: 'Resume Brain', icon: PlayCircle, event: { type: 'RESUME_BRAIN' as const }, iconColor: 'text-green-400' }]
                  : [{ separator: true, label: 'Pause Brain', icon: Pause, event: { type: 'PAUSE_BRAIN' as const }, iconColor: 'text-yellow-400' }]
                ),
                { label: 'Restart Brain', icon: RefreshCw, event: { type: 'RESTART_BRAIN' as const }, iconColor: 'text-amber-400' },
                { label: 'Kill Brain', icon: Power, event: { type: 'KILL_BRAIN' as const }, iconColor: 'text-red-400' },
              ]
          ),
        ]),
      },
      on: {
        RECEIVE_PLUGIN_DATA: {
          actions: 'setBrainData'
        },
        'NODE.CLICK': {
          actions: 'requestNodeDetails'
        },
        'SELECT_AND_SHOW_FIRST_NODE': {
          actions: 'selectAndShowFirstNode'
        },
        'FLOW.NAVIGATE': {
          actions: 'navigateToFlow'
        },
        'BACK.CLICK': {
          guard: 'canGoBack',
          actions: 'goBack'
        },
        'EVENT.CLICK': {
        },
        TOGGLE_LEFT_PANEL: {
          actions: 'toggleLeftPanel'
        },
        TOGGLE_INSPECT: {
          actions: 'toggleInspect'
        },
        INSPECT_TOGGLED: {
          actions: 'setInspectEnabled'
        },
        TOGGLE_ANIMATIONS: {
          actions: 'toggleAnimations'
        },
        CLOSE_DETAILS: {
          actions: 'closeDetails'
        },
        TNODE_DETAILS: {
          actions: 'setStepNodeDetails'
        },
        PLUGIN_ACTIVATED: {
          actions: 'requestPluginData'
        },
        PLUGIN_DEACTIVATED: {
          // No action needed for deactivation
        },
        TNODE_OPENED: {
          actions: 'setTNodeData'
        },
        TNODE_SPAWNED: {
          actions: 'addTNodeToTree'
        },
        TNODE_UPDATED: {
          actions: ['updateTNodeInTree', 'refreshNodeDetailsIfSelected']
        },
        EVENT_PULSE: {
          actions: ['pulseEvent', ({ system, context }) => {
            // Clear pulse after animation
            setTimeout(() => {
              system.get(id).send({ type: 'CLEAR_PULSE' });
            }, 400);
            // Request fresh data for the current flow to show new events
            // Pass the current flowTNodeId to maintain the current view
            setTimeout(() => {
              trpc.bus.send.mutate({
                systemId: id,
                type: 'REQUEST_PLUGIN_DATA',
                ...(context.flowTNodeId && { flowTNodeId: context.flowTNodeId })
              });
            }, 100);
          }]
        },
        CLEAR_PULSE: {
          actions: 'clearPulse'
        },
        BRAIN_SETTINGS_UPDATED: {
          actions: 'updateSettings'
        },
        RESTART_BRAIN: {
          actions: 'restartBrain'
        },
        KILL_BRAIN: {
          actions: 'killBrain'
        },
        BRAIN_KILLED: {
          actions: 'setBrainKilled'
        },
        BRAIN_STARTED: {
          actions: 'setBrainStarted'
        },
        PAUSE_BRAIN: {
          actions: 'pauseBrain'
        },
        RESUME_BRAIN: {
          actions: 'resumeBrain'
        },
        BRAIN_PAUSED: {
          actions: 'setBrainPaused'
        },
        BRAIN_RESUMED: {
          actions: 'setBrainResumed'
        },
        BRAIN_RUNTIME_ERROR: {
          actions: ['addRuntimeError', ({ event }) => {
            if (event.type !== 'BRAIN_RUNTIME_ERROR' || !event.error.tNodeId) return;
            trpc.bus.send.mutate({
              systemId: id,
              type: 'GET_TNODE_DETAILS',
              tNodeId: event.error.tNodeId
            });
          }]
        },
        DISMISS_RUNTIME_ERROR: {
          actions: 'dismissRuntimeError'
        },
        TRAIL_CLICK: {
          actions: 'handleBreadcrumbClick'
        }
      }
    }
  },
});

export default brainState;
