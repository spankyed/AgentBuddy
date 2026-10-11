// The prompts plugin's contract: the state it publishes and what other plugins may send it.
//
// A leaf: no machine, no other feature, and nothing from `#generated/*` but `types` and `ears` — which is what lets
// codegen read the contract without resolving the machine, whose imports cycle back through `#generated/events`.
// `apack.json` names it at `features[].plugin.contract`.
import type { PluginInbox } from '@apack/sdk/fe'
import type { PromptEntity, TemplateInput } from '@apack/sdk'
import type { EARS } from '#generated/ears.ts'
import type { Category } from '#generated/types.ts'

export interface PromptsContext {
  selectedPromptId?: EARS.EntityId;
  /**
   * The call the outstanding `PROMPT_SELECT` was asked under, or absent when nothing is outstanding.
   *
   * `selectedPromptId` cannot do this job: it is written *from* the answer, so two quick selections are
   * otherwise decided by whichever answer arrives last.
   *
   * **A domain id cannot do this job, for two independent reasons.** It does not distinguish windows, so
   * another window's answer for the same prompt satisfies it; and it does not distinguish asks, so a slot
   * holding one is only ever overwritten, never emptied — which names the last ask for the life of the
   * plugin. A call is per ask and per window, and the slot is cleared when its answer lands.
   */
  pendingPromptCall: string | null;
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
