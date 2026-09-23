// The actions plugin's contract: the state it publishes and what other plugins may send it.
//
// A leaf: no machine, no other feature, and nothing from `#generated/*` but `types` and `ears` — which is what lets
// codegen read the contract without resolving the machine, whose imports cycle back through `#generated/events`.
// `abuddy.json` names it at `features[].plugin.contract`.
import type { PluginInbox } from '@abuddy/sdk/fe'
import type { ActionEntity, ActionParameter } from '@abuddy/sdk'
import type { EARS } from '@/__generated__/ears'
import type { Category } from '@/__generated__/types'

export interface ActionsContext {
  selectedActionId?: EARS.EntityId;
  actions: ActionEntity[];
  selectedAction?: ActionEntity;
  totalCount: number;
  page: number;
  totalPages: number;
  loadingMore: boolean;
  categories: Category[]; // Categories from settings
  selectedCategories: string[]; // Filter state

  // Import/Export state
  actionsImport: {
    status: 'idle' | 'importing' | 'success' | 'error';
    errors: string[];
    importedCount: number;
  };
  actionsExport: {
    status: 'idle' | 'exporting' | 'success' | 'error';
    errors: string[];
    filePath: string;
    actionCount: number;
  };

  // Form data for create/edit
  formData: {
    label: string;
    description?: string;
    category?: string;
    input: Record<string, ActionParameter>;
    actionFn: string;
    output?: any;
    parametersExpanded?: boolean;
    outputExpanded?: boolean;
    metadataExpanded?: boolean;
  };
}

/** Paging and editing, which the code plugin's actions panel asks of it */
export type ActionsInboxEvent =
  | { type: 'ACTION.SELECT'; actionId: EARS.EntityId }
  | { type: 'ACTION.CREATE' }
  | { type: 'ACTION.DELETE'; actionId: EARS.EntityId }
  | { type: 'ACTION.UPDATE_INPUT'; actionId: string; input: Record<string, any> }
  | { type: 'ACTION.CREATE_INLINE'; label: string; actionFn: string; input: Record<string, any> }
  | { type: 'ACTION.UPDATE_LABEL'; actionId: string; label: string }
  | { type: 'ACTIONS.LOAD_MORE' }
  | { type: 'ACTIONS.LOAD_ALL' }

export type Contract = {
  state: ActionsContext
  inbox: PluginInbox<{ pack: ActionsInboxEvent }>
}
