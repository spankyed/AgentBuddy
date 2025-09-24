import { assign, setup, type ActorRefFrom } from 'xstate';
import { safeEvents } from '@/core/types/safe-events';
import type {
  OutgoingBrainEvents,
} from '@app/api'
import type { TNodeEntity, EventListenerEntity, FlowTNodeData, TrackEntity } from '@app/api';
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
  pulsingEventType?: string;
  // UI state
  showLeftPanel: boolean;
  showRightPanel: boolean;
  selectedStepNode?: TNodeEntity;
  debugEnabled: boolean;
  animationsEnabled: boolean;
  brainIsDead: boolean;
  // Settings
  settings?: any; // BrainSettings
}

type SystemEvent = OutgoingBrainEvents
  | { type: 'TNODE_DETAILS'; tNodeId: string; details: TNodeEntity | null }
  | { type: 'DEBUG_TOGGLED'; enabled: boolean }
  | { type: 'BRAIN_SETTINGS_UPDATED'; settings: any }
  | { type: 'BRAIN_KILLED' }
  | { type: 'BRAIN_STARTED' }

type UIEvent =
  | { type: 'NODE.CLICK'; nodeId: string }
  | { type: 'SELECT_AND_SHOW_FIRST_NODE' }
  | { type: 'FLOW.NAVIGATE'; flowId: string }
  | { type: 'BACK.CLICK' }
  | { type: 'EVENT.CLICK'; eventType: string }
  | { type: 'TOGGLE_LEFT_PANEL' }
  | { type: 'TOGGLE_RIGHT_PANEL' }
  | { type: 'CLOSE_DETAILS' }
  | { type: 'TOGGLE_DEBUG' }
  | { type: 'TOGGLE_ANIMATIONS' }

type PluginEvent =
  | { type: 'PLUGIN_ACTIVATED' }
  | { type: 'PLUGIN_DEACTIVATED' }

export type BrainEvents = UIEvent | SystemEvent | PluginEvent
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
    setBrainData: assign(({ event }) => {
      const typedEv = typeOf('RECEIVE_PLUGIN_DATA', event);
      const normalizedTree = typedEv.data.tNodeTree ? normalizeTNodeTree(typedEv.data.tNodeTree) : undefined;
      return {
        flowTNodeId: typedEv.data.flowTNodeId,
        tNodeTree: typedEv.data.tNodeTree,
        normalizedTree,
        possibleEvents: typedEv.data.possibleEvents,
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
      };
    }),
    addTNodeToTree: assign(({ context, event }) => {
      if (event.type !== 'TNODE_SPAWNED') return {};

      const { tNode, parentId, eventTNodeId, flowTNodeId } = event;

      // Note: We now accept all events regardless of flow to ensure real-time updates
      // The view context is maintained separately
      
      if (!context.normalizedTree) {
        // Initialize if not present
        return {
          normalizedTree: {
            byId: { [tNode.id]: tNode },
            rootIds: parentId ? [] : [tNode.id],
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

      // Update parent's children if parentId exists
      if (parentId) {
        if (!newTree.childrenById[parentId]) {
          newTree.childrenById[parentId] = [];
        } else {
          newTree.childrenById[parentId] = [...newTree.childrenById[parentId]];
        }
        newTree.childrenById[parentId].push(tNode.id);
      } else {
        // No parent means it's a root node
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
        tNodeId: event.flowId
      });
    },
    goBack: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GO_BACK_TNODE'
      });
    },
    requestPluginData: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'REQUEST_PLUGIN_DATA'
      });
    },
    toggleLeftPanel: assign({
      showLeftPanel: ({ context }) => !context.showLeftPanel
    }),
    toggleRightPanel: assign({
      showRightPanel: ({ context }) => !context.showRightPanel
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
    toggleDebug: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'TOGGLE_DEBUG'
      });
    },
    setDebugEnabled: assign(({ event }) => {
      if (event.type !== 'DEBUG_TOGGLED') return {};
      return {
        debugEnabled: event.enabled
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
      brainIsDead: true
    }),
    setBrainStarted: assign({
      brainIsDead: false
    }),
  },
  guards: {
    canGoBack: ({ context }) => {
      return true;
    }
  },
}).createMachine({
  id,
  context: {
    possibleEvents: [],
    showLeftPanel: false,
    showRightPanel: false,
    debugEnabled: false,
    animationsEnabled: true,
    selectedStepNode: undefined,
    brainIsDead: false, // Start as running to prevent flash of dead UI
  },
  initial: 'loading',
  states: {
    loading: {
      on: {
        RECEIVE_PLUGIN_DATA: {
          target: 'ready',
          actions: 'setBrainData'
        }
      }
    },
    ready: {
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
        TOGGLE_RIGHT_PANEL: {
          actions: 'toggleRightPanel'
        },
        TOGGLE_DEBUG: {
          actions: 'toggleDebug'
        },
        DEBUG_TOGGLED: {
          actions: 'setDebugEnabled'
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
        BRAIN_KILLED: {
          actions: 'setBrainKilled'
        },
        BRAIN_STARTED: {
          actions: 'setBrainStarted'
        }
      }
    }
  },
});

export default brainState;