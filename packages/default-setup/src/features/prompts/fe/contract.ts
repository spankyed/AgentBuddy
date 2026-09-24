// The prompts plugin's contract: the state it publishes and what other plugins may send it.
//
// A leaf: no machine, no other feature, and nothing from `#generated/*` but `types` and `ears` — which is what lets
// codegen read the contract without resolving the machine, whose imports cycle back through `#generated/events`.
// `abuddy.json` names it at `features[].plugin.contract`.
import type { PluginInbox } from '@abuddy/sdk/fe'
import type { PromptEntity, TemplateInput } from '@abuddy/sdk'
import type { EARS } from '@/__generated__/ears'
import type { Category } from '@/__generated__/types'

export interface PromptsContext {
  selectedPromptId?: EARS.EntityId;
  prompts: PromptEntity[];
  selectedPrompt?: PromptEntity;
  totalCount: number;
  page: number;
  totalPages: number;
  loadingMore: boolean;
  categories: Category[]; // Categories from settings
  selectedCategories: string[]; // Filter state

  // Import/Export state
  promptsImport: {
    status: 'idle' | 'importing' | 'success' | 'error';
    errors: string[];
    importedCount: number;
  };
  promptsExport: {
    status: 'idle' | 'exporting' | 'success' | 'error';
    errors: string[];
    filePath: string;
    promptCount: number;
  };

  // Form data for create/edit
  formData: {
    label: string;
    description?: string;
    category?: string;
    inputs: Record<string, TemplateInput>;
    templateFn: string;
    outputSchema?: any;
    inputsExpanded?: boolean;
    outputExpanded?: boolean;
    metadataExpanded?: boolean;
  };
}

/** Paging and editing, which the code plugin's prompts panel asks of it */
export type PromptsInboxEvent =
  | { type: 'PROMPTS.LOAD_ALL' }
  | { type: 'PROMPTS.LOAD_MORE' }
  | { type: 'PROMPT.UPDATE_INPUTS'; promptId: string; inputs: Record<string, any> }
  | { type: 'PROMPT.UPDATE_LABEL'; promptId: string; label: string }
  | { type: 'PROMPT.DELETE'; promptId: EARS.EntityId }
  | { type: 'PROMPT.CREATE_INLINE'; label: string; templateFn: string; inputs: Record<string, any> }
  | { type: 'PROMPT.SELECT'; promptId: EARS.EntityId }

export type Contract = {
  state: PromptsContext
  inbox: PluginInbox<{ pack: PromptsInboxEvent }>
}
