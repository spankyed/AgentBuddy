// The browser plugin's contract: the state it publishes and what other plugins may send it.
//
// A leaf: no machine, no other feature, and nothing from `#generated/*` but `types` and `ears` — which is what lets
// codegen read the contract without resolving the machine, whose imports cycle back through `#generated/events`.
// `abuddy.json` names it at `features[].plugin.contract`.
import type { PluginInbox } from '@abuddy/sdk/fe'
import type { TabGroup } from '@abuddy/sdk/fe'
import type { BrowserSettings } from '@/__generated__/types'
import type { AutocompleteSuggestion } from './history.ts'

export type BrowserTabPersistedId = `BrowserTab-${string}`;

export interface BrowserTab {
  id: number;
  persistedId?: BrowserTabPersistedId;
  url: string;
  title: string;
  favicon: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isMuted: boolean;
  groupId?: string;
}

export interface Bookmark {
  url: string;
  title: string;
  favicon: string;
  displayOrder: number;
}

export interface BrowserContext {
  tabs: BrowserTab[];
  activeTabId: number | null;
  addressBarValue: string;
  isAddressBarFocused: boolean;
  // Tab groups
  tabGroups: TabGroup[];
  // Autocomplete
  suggestions: AutocompleteSuggestion[];
  selectedSuggestionIndex: number; // -1 = user's own input
  inlineCompletion: string | null;
  preAutocompleteValue: string;
  _lastNavWasTyped: boolean;
  // Bookmarks
  bookmarks: Bookmark[];
  /** This feature's own settings, as the app sends them (`FEATURE_SETTINGS_UPDATED`) */
  settings: BrowserSettings;
}

/** A link the user chose to open in the app rather than the OS browser */
export type BrowserInboxEvent = { type: 'TAB.CREATE'; url?: string }

export type Contract = {
  state: BrowserContext
  inbox: PluginInbox<{ pack: BrowserInboxEvent }>
}
