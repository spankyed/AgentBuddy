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
}

type SystemEvent = OutgoingBrainEvents
  | { type: 'TNODE_DETAILS'; tNodeId: string; details: TNodeEntity | null }

type UIEvent =
  | { type: 'TNODE.CLICK'; tNodeId: string }
  | { type: 'STEP_NODE.CLICK'; tNodeId: string }
  | { type: 'BACK.CLICK' }
  | { type: 'EVENT.CLICK'; eventType: string }
  | { type: 'TOGGLE_LEFT_PANEL' }
  | { type: 'TOGGLE_RIGHT_PANEL' }
  | { type: 'CLOSE_DETAILS' }

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
      
      // Only add nodes that belong to the currently viewed flow
      if (flowTNodeId !== context.flowTNodeId) {
        return {}; // Ignore events from other flows
      }
      
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
    pulseEvent: assign(({ event }) => {
      if (event.type !== 'EVENT_PULSE') return {};
      return {
        pulsingEventType: event.eventType
      };
    }),
    clearPulse: assign({
      pulsingEventType: undefined
    }),
    openTNode: ({ event }) => {
      let tNodeId: string;
      
      if (event.type === 'TNODE.CLICK') {
        tNodeId = event.tNodeId;
      } else {
        return;
      }
      
      trpc.bus.send.mutate({
        systemId: id,
        type: 'OPEN_TNODE',
        tNodeId
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
    requestStepNodeDetails: ({ event }) => {
      if (event.type !== 'STEP_NODE.CLICK') return;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GET_TNODE_DETAILS',
        tNodeId: event.tNodeId
      });
    },
    setStepNodeDetails: assign(({ event }) => {
      if (event.type !== 'TNODE_DETAILS') return {};
      return {
        selectedStepNode: event.details || undefined
      };
    }),
    closeDetails: assign({
      selectedStepNode: undefined
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
        'TNODE.CLICK': {
          actions: 'openTNode'
        },
        'BACK.CLICK': {
          guard: 'canGoBack',
          actions: 'goBack'
        },
        'EVENT.CLICK': {
        },
        'STEP_NODE.CLICK': {
          actions: 'requestStepNodeDetails'
        },
        TOGGLE_LEFT_PANEL: {
          actions: 'toggleLeftPanel'
        },
        TOGGLE_RIGHT_PANEL: {
          actions: 'toggleRightPanel'
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
          actions: 'updateTNodeInTree'
        },
        EVENT_PULSE: {
          actions: ['pulseEvent', ({ system }) => {
            // Clear pulse after animation
            setTimeout(() => {
              system.get(id).send({ type: 'CLEAR_PULSE' });
            }, 400);
            // Also request fresh data to show the new event
            setTimeout(() => {
              trpc.bus.send.mutate({
                systemId: id,
                type: 'REQUEST_PLUGIN_DATA'
              });
            }, 100);
          }]
        },
        CLEAR_PULSE: {
          actions: 'clearPulse'
        }
      }
    }
  },
});

export default brainState;