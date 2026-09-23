// The flows plugin's contract: the state it publishes and what other plugins may send it.
//
// A leaf: no machine, no other feature, and nothing from `#generated/*` but `types` and `ears`. Its inbox used to
// be `OutgoingActionEvents` — eleven events from the actions feature's `be/system`, where this plugin handles
// three. Spelling those three out is what lets the contract live in a leaf at all: a leaf may not import another
// feature. `abuddy.json` names it at `features[].plugin.contract`.
import type { NavHistory, PluginInbox } from '@abuddy/sdk/fe'
import type { ActionEntity, FlowEntity, PromptEntity } from '@abuddy/sdk'
import type { ModelCatalogEntry } from '@abuddy/sdk/models'
import type { EARS } from '@/__generated__/ears'
import type { EdgeEntity, NodeEntity } from '@/__generated__/types'

export interface FlowsContext {
  selectedNodeId?: EARS.EntityId;
  editingNodeId?: EARS.EntityId; // Node currently being edited
  selectedFlowId?: EARS.EntityId;
  // Handle selection for click-to-connect workflow
  selectedHandle?: {
    nodeId: string;
    handleId?: string;
  };
  graph: {
    nodes: NodeEntity[];
    edges: EdgeEntity[];
    // Store positions separately from node data
    positions: Record<string, { x: number; y: number }>;
  };
  flows: FlowEntity[];
  // Resources available for node configuration
  prompts: PromptEntity[];
  models: ModelCatalogEntry[];
  actions: ActionEntity[];
  // Track temporary IDs during async creation
  tempIdMap: Record<string, string>; // tempId -> permanentId
  /** The root flow the brain runs (the flow with the root role), as the flows system last sent it */
  rootFlowId?: string;
  // Settings
  settings?: any; // FlowsSettings
  // Dialog bridge flags (set by context menu, consumed by watchers in flow-canvas.vue)
  showEditLabelDialog?: boolean;
  showDeleteFlowDialog?: boolean;
  canvasError?: string;
  // DSL Import state
  dslImport: {
    status: 'idle' | 'importing' | 'success' | 'error';
    errors: string[];
    importedFlowNames: string[];
  };
  // DSL Export state
  dslExport: {
    status: 'idle' | 'exporting' | 'success' | 'error';
    errors: string[];
    filePath: string;
    flowCount: number;
  };
  navHistory: NavHistory<string | null>;
}

/** The actions system keeps the flows editor's action list current, and the brain opens a flow or a node in it */
export type FlowsInboxEvent =
  | { type: 'ACTION_CREATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_UPDATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_DELETED'; actionId: EARS.EntityId }
  | { type: 'FLOW.SELECT'; flowId: EARS.EntityId }
  | { type: 'NODE.DOUBLE_CLICK'; nodeId: string }

export type Contract = {
  state: FlowsContext
  inbox: PluginInbox<{ pack: FlowsInboxEvent }>
}
