import { setup, assign, fromCallback, type ActorRefFrom } from 'xstate';
import { autocomplete, recordVisit, updateHistoryMeta, displayUrl, type AutocompleteSuggestion } from './history.ts';
import { trpc } from '@/core/trpc';
import { getNextAvailableColor, saveTabGroups, loadTabGroups, type TabGroup, type TabGroupColor } from '@/shared/tab-groups';

export type { TabGroup, TabGroupColor };

export const id = 'browser' as const;

export interface BrowserTab {
  id: number;
  url: string;
  title: string;
  favicon: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isMuted: boolean;
  groupId?: string;
}

export type { AutocompleteSuggestion };

interface SavedTab {
  url: string;
  title: string;
  favicon: string;
  displayOrder: number;
  isMuted: boolean;
  groupId?: string;
}

interface BrowserContext {
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
}

type BrowserEvents =
  // UI events
  | { type: 'TAB.CREATE'; url?: string }
  | { type: 'TAB.CLOSE'; tabId: number }
  | { type: 'TAB.SELECT'; tabId: number }
  | { type: 'TAB.DUPLICATE'; tabId: number }
  | { type: 'TAB.CLOSE_OTHERS'; tabId: number }
  | { type: 'TAB.TOGGLE_MUTE'; tabId: number }
  | { type: 'TAB.ADD_TO_GROUP'; tabId: number; groupId: string }
  | { type: 'TAB.REMOVE_FROM_GROUP'; tabId: number }
  | { type: 'GROUP.CREATE'; name?: string; tabIds?: number[] }
  | { type: 'GROUP.RENAME'; groupId: string; name: string }
  | { type: 'GROUP.CHANGE_COLOR'; groupId: string; color: TabGroupColor }
  | { type: 'GROUP.DELETE'; groupId: string; closeTabs?: boolean }
  | { type: 'GROUP.TOGGLE_COLLAPSE'; groupId: string }
  | { type: 'NAV.GO'; url: string }
  | { type: 'NAV.BACK' }
  | { type: 'NAV.FORWARD' }
  | { type: 'NAV.RELOAD' }
  | { type: 'NAV.STOP' }
  | { type: 'ADDRESS_BAR.UPDATE'; value: string }
  | { type: 'ADDRESS_BAR.FOCUS' }
  | { type: 'ADDRESS_BAR.BLUR' }
  // Autocomplete events
  | { type: 'AUTOCOMPLETE.SELECT'; index: number }
  | { type: 'AUTOCOMPLETE.DISMISS' }
  | { type: 'AUTOCOMPLETE.ACCEPT_INLINE' }
  | { type: 'AUTOCOMPLETE.RESULTS'; suggestions: AutocompleteSuggestion[]; inlineCompletion: string | null }
  // Backend events
  | { type: 'BROWSER_CONNECTED'; savedTabs: SavedTab[] }
  // IPC bridge events
  | { type: 'IPC.TAB_CREATED'; tab: BrowserTab }
  | { type: 'IPC.TAB_REMOVED'; tabId: number }
  | { type: 'IPC.TAB_UPDATED'; tabId: number; changes: Partial<BrowserTab> }
  | { type: 'IPC.ACTIVE_TAB_CHANGED'; tabId: number };

export type BrowserState = ActorRefFrom<typeof browserState>;

function navAction(method: 'goBack' | 'goForward' | 'reload' | 'stop') {
  return ({ context }: { context: BrowserContext }) => {
    if (context.activeTabId !== null) {
      window.electronAPI?.browser[method](context.activeTabId);
    }
  };
}

// Debounce tab sync to backend (2s after last change)
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function syncTabsToBackend(tabs: BrowserTab[]) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const persistable = tabs
      .filter(t => t.url && t.url !== 'about:blank' && !t.url.startsWith('data:'))
      .map((t, i) => ({
        url: t.url,
        title: t.title,
        favicon: t.favicon,
        displayOrder: i,
        isMuted: t.isMuted,
        groupId: t.groupId,
      }));
    trpc.bus.send.mutate({ systemId: id, type: 'SYNC_TABS', tabs: persistable });
  }, 2000);
}

const GROUPS_STORAGE_KEY = 'browser-tab-groups';

function persistState(context: BrowserContext) {
  saveTabGroups(GROUPS_STORAGE_KEY, context.tabGroups);
  syncTabsToBackend(context.tabs);
}

function persistGroupsOnly(context: BrowserContext) {
  saveTabGroups(GROUPS_STORAGE_KEY, context.tabGroups);
}

function generateGroupId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Map url→groupId for restoring group assignments when tabs are recreated on startup
const pendingGroupAssignments = new Map<string, string[]>();

function deleteEmptyGroups(tabs: BrowserTab[], groups: TabGroup[]): TabGroup[] {
  const usedGroupIds = new Set(tabs.filter(t => t.groupId).map(t => t.groupId!));
  return groups.filter(g => usedGroupIds.has(g.id));
}

// Debounce autocomplete queries outside the machine to avoid timer in context
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function runAutocompleteQuery(query: string, sendBack: (event: BrowserEvents) => void) {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (query.length < 1) {
    sendBack({ type: 'AUTOCOMPLETE.RESULTS', suggestions: [], inlineCompletion: null });
    return;
  }
  debounceTimer = setTimeout(() => {
    const suggestions = autocomplete(query);
    let inlineCompletion: string | null = null;
    if (suggestions.length > 0 && suggestions[0].matchType === 'url') {
      const display = displayUrl(suggestions[0].url);
      if (display.toLowerCase().startsWith(query.toLowerCase())) {
        inlineCompletion = display.slice(query.length);
      }
    }
    sendBack({ type: 'AUTOCOMPLETE.RESULTS', suggestions, inlineCompletion });
  }, 100);
}

const browserState = setup({
  types: {
    context: {} as BrowserContext,
    events: {} as BrowserEvents,
  },
  actors: {
    ipcBridge: fromCallback(({ sendBack }) => {
      const api = window.electronAPI?.browser;
      if (!api) return;

      const unsubs = [
        api.onTabCreated((tab) => sendBack({ type: 'IPC.TAB_CREATED', tab })),
        api.onTabRemoved((tabId) => sendBack({ type: 'IPC.TAB_REMOVED', tabId })),
        api.onTabUpdated((tabId, changes) => sendBack({ type: 'IPC.TAB_UPDATED', tabId, changes })),
        api.onActiveTabChanged((tabId) => sendBack({ type: 'IPC.ACTIVE_TAB_CHANGED', tabId })),
      ];

      return () => unsubs.forEach(unsub => unsub());
    }),
  },
  actions: {
    navigate: ({ context }) => {
      const url = context.addressBarValue.trim();
      if (!url) return;
      if (context.activeTabId !== null) {
        window.electronAPI?.browser.navigate(context.activeTabId, url);
      } else {
        window.electronAPI?.browser.createTab(url);
      }
    },
    goBack: navAction('goBack'),
    goForward: navAction('goForward'),
    reload: navAction('reload'),
    stop: navAction('stop'),
  },
}).createMachine({
  id,
  initial: 'active',
  context: {
    tabs: [],
    activeTabId: null,
    addressBarValue: '',
    isAddressBarFocused: false,
    tabGroups: [],
    suggestions: [],
    selectedSuggestionIndex: -1,
    inlineCompletion: null,
    preAutocompleteValue: '',
    _lastNavWasTyped: false,
  },
  invoke: { src: 'ipcBridge' },
  states: {
    active: {
      on: {
        'TAB.CREATE': {
          actions: ({ event }) => {
            window.electronAPI?.browser.createTab(event.url);
          },
        },
        'TAB.CLOSE': {
          actions: ({ event }) => {
            window.electronAPI?.browser.closeTab(event.tabId);
          },
        },
        'TAB.SELECT': {
          actions: ({ event }) => {
            window.electronAPI?.browser.selectTab(event.tabId);
          },
        },
        'TAB.DUPLICATE': {
          actions: ({ event }) => {
            window.electronAPI?.browser.duplicateTab(event.tabId);
          },
        },
        'TAB.CLOSE_OTHERS': {
          actions: ({ context, event }) => {
            for (const tab of context.tabs) {
              if (tab.id !== event.tabId) {
                window.electronAPI?.browser.closeTab(tab.id);
              }
            }
          },
        },
        'TAB.TOGGLE_MUTE': {
          actions: ({ context, event }) => {
            const tab = context.tabs.find(t => t.id === event.tabId);
            if (tab) {
              window.electronAPI?.browser.setTabMuted(event.tabId, !tab.isMuted);
            }
          },
        },
        // Tab group actions
        'TAB.ADD_TO_GROUP': {
          actions: [
            assign(({ context, event }) => {
              const tabs = context.tabs.map(t =>
                t.id === event.tabId ? { ...t, groupId: event.groupId } : t,
              );
              return { tabs };
            }),
            ({ context }) => persistState(context),
          ],
        },
        'TAB.REMOVE_FROM_GROUP': {
          actions: [
            assign(({ context, event }) => {
              const tabs = context.tabs.map(t =>
                t.id === event.tabId ? { ...t, groupId: undefined } : t,
              );
              const tabGroups = deleteEmptyGroups(tabs, context.tabGroups);
              return { tabs, tabGroups };
            }),
            ({ context }) => persistState(context),
          ],
        },
        'GROUP.CREATE': {
          actions: [
            assign(({ context, event }) => {
              const color = getNextAvailableColor(context.tabGroups);
              const newGroup: TabGroup = {
                id: generateGroupId(),
                name: event.name || `Group ${context.tabGroups.length + 1}`,
                color,
                isCollapsed: false,
                order: context.tabGroups.length,
              };
              const tabGroups = [...context.tabGroups, newGroup];
              const tabs = event.tabIds
                ? context.tabs.map(t => event.tabIds!.includes(t.id) ? { ...t, groupId: newGroup.id } : t)
                : context.tabs;
              return { tabGroups, tabs };
            }),
            ({ context }) => persistState(context),
          ],
        },
        'GROUP.RENAME': {
          actions: [
            assign(({ context, event }) => ({
              tabGroups: context.tabGroups.map(g =>
                g.id === event.groupId ? { ...g, name: event.name } : g,
              ),
            })),
            ({ context }) => persistGroupsOnly(context),
          ],
        },
        'GROUP.CHANGE_COLOR': {
          actions: [
            assign(({ context, event }) => ({
              tabGroups: context.tabGroups.map(g =>
                g.id === event.groupId ? { ...g, color: event.color } : g,
              ),
            })),
            ({ context }) => persistGroupsOnly(context),
          ],
        },
        'GROUP.DELETE': {
          actions: [
            ({ context, event }) => {
              if (event.closeTabs) {
                for (const tab of context.tabs) {
                  if (tab.groupId === event.groupId) {
                    window.electronAPI?.browser.closeTab(tab.id);
                  }
                }
              }
            },
            assign(({ context, event }) => {
              const tabGroups = context.tabGroups.filter(g => g.id !== event.groupId);
              const tabs = event.closeTabs
                ? context.tabs // tabs will be removed via IPC.TAB_REMOVED
                : context.tabs.map(t => t.groupId === event.groupId ? { ...t, groupId: undefined } : t);
              return { tabGroups, tabs };
            }),
            ({ context }) => persistState(context),
          ],
        },
        'GROUP.TOGGLE_COLLAPSE': {
          actions: [
            assign(({ context, event }) => ({
              tabGroups: context.tabGroups.map(g =>
                g.id === event.groupId ? { ...g, isCollapsed: !g.isCollapsed } : g,
              ),
            })),
            ({ context }) => persistGroupsOnly(context),
          ],
        },
        'NAV.GO': {
          actions: [
            assign(({ context, event }) => {
              // If a suggestion is selected, use its URL
              const url = context.selectedSuggestionIndex >= 0
                ? context.suggestions[context.selectedSuggestionIndex]?.url ?? event.url
                : event.url;
              return {
                addressBarValue: url,
                suggestions: [],
                selectedSuggestionIndex: -1,
                inlineCompletion: null,
                _lastNavWasTyped: true,
              };
            }),
            'navigate',
          ],
        },
        'NAV.BACK': { actions: 'goBack' },
        'NAV.FORWARD': { actions: 'goForward' },
        'NAV.RELOAD': { actions: 'reload' },
        'NAV.STOP': { actions: 'stop' },
        'ADDRESS_BAR.UPDATE': {
          actions: [
            assign(({ event }) => ({
              addressBarValue: event.value,
              preAutocompleteValue: event.value,
              selectedSuggestionIndex: -1,
              inlineCompletion: null,
            })),
            ({ event, self }) => {
              runAutocompleteQuery(event.value.trim(), (e) => self.send(e));
            },
          ],
        },
        'ADDRESS_BAR.FOCUS': {
          actions: assign({ isAddressBarFocused: true }),
        },
        'ADDRESS_BAR.BLUR': {
          actions: assign({
            isAddressBarFocused: false,
            suggestions: [],
            selectedSuggestionIndex: -1,
            inlineCompletion: null,
          }),
        },
        // Autocomplete
        'AUTOCOMPLETE.RESULTS': {
          actions: assign(({ event }) => ({
            suggestions: event.suggestions,
            inlineCompletion: event.inlineCompletion,
          })),
        },
        'AUTOCOMPLETE.SELECT': {
          actions: assign(({ context, event }) => {
            if (event.index === -1) {
              return {
                selectedSuggestionIndex: -1,
                addressBarValue: context.preAutocompleteValue,
                inlineCompletion: null,
              };
            }
            const suggestion = context.suggestions[event.index];
            if (!suggestion) return {};
            return {
              selectedSuggestionIndex: event.index,
              addressBarValue: suggestion.url,
              inlineCompletion: null,
            };
          }),
        },
        'AUTOCOMPLETE.DISMISS': {
          actions: assign({
            suggestions: [],
            selectedSuggestionIndex: -1,
            inlineCompletion: null,
          }),
        },
        'AUTOCOMPLETE.ACCEPT_INLINE': {
          actions: assign(({ context }) => {
            if (!context.inlineCompletion) return {};
            const full = context.preAutocompleteValue + context.inlineCompletion;
            return {
              addressBarValue: full,
              preAutocompleteValue: full,
              inlineCompletion: null,
            };
          }),
        },
        // Backend events
        'BROWSER_CONNECTED': {
          actions: [
            assign(() => ({
              tabGroups: loadTabGroups(GROUPS_STORAGE_KEY),
            })),
            ({ context, event }) => {
              if (context.tabs.length === 0 && event.savedTabs.length > 0) {
                // Set up pending group assignments for restored tabs
                pendingGroupAssignments.clear();
                for (const saved of event.savedTabs) {
                  if (saved.groupId) {
                    const queue = pendingGroupAssignments.get(saved.url) ?? [];
                    queue.push(saved.groupId);
                    pendingGroupAssignments.set(saved.url, queue);
                  }
                }
                // Create tabs lazily — don't load URLs until the user opens the browser plugin
                for (const saved of event.savedTabs) {
                  window.electronAPI?.browser.createTab(saved.url, {
                    lazy: true,
                    title: saved.title,
                    favicon: saved.favicon,
                  });
                }
              }
            },
          ],
        },
        // IPC events
        'IPC.TAB_CREATED': {
          actions: [
            assign(({ context, event }) => {
              if (context.tabs.some(t => t.id === event.tab.id)) return {};
              // Apply pending group assignment from restore
              const tab = { ...event.tab };
              const queue = pendingGroupAssignments.get(tab.url);
              if (queue?.length) {
                tab.groupId = queue.shift();
                if (queue.length === 0) pendingGroupAssignments.delete(tab.url);
              }
              return { tabs: [...context.tabs, tab] };
            }),
            ({ context }) => syncTabsToBackend(context.tabs),
          ],
        },
        'IPC.TAB_REMOVED': {
          actions: [
            assign(({ context, event }) => {
              const tabs = context.tabs.filter(t => t.id !== event.tabId);
              const tabGroups = deleteEmptyGroups(tabs, context.tabGroups);
              return {
                tabs,
                tabGroups,
                activeTabId: context.activeTabId === event.tabId
                  ? (tabs.at(-1)?.id ?? null)
                  : context.activeTabId,
                ...(context.activeTabId === event.tabId
                  ? { addressBarValue: tabs.at(-1)?.url ?? '' }
                  : {}),
              };
            }),
            ({ context }) => persistState(context),
          ],
        },
        'IPC.TAB_UPDATED': {
          actions: [
            assign(({ context, event }) => {
              const tabs = context.tabs.map(t =>
                t.id === event.tabId ? { ...t, ...event.changes } : t,
              );
              const syncUrl = !context.isAddressBarFocused
                && event.tabId === context.activeTabId
                && event.changes.url !== undefined;
              return {
                tabs,
                ...(syncUrl ? { addressBarValue: event.changes.url } : {}),
                ...(event.changes.url ? { _lastNavWasTyped: false } : {}),
              };
            }),
            ({ context, event }) => {
              if (event.changes.url && event.changes.url !== 'about:blank' && !event.changes.url.startsWith('data:')) {
                const tab = context.tabs.find(t => t.id === event.tabId);
                recordVisit(event.changes.url, tab?.title ?? '', tab?.favicon ?? '', context._lastNavWasTyped);
              }
              if ((event.changes.title || event.changes.favicon) && !event.changes.url) {
                const tab = context.tabs.find(t => t.id === event.tabId);
                if (tab?.url) updateHistoryMeta(tab.url, event.changes.title, event.changes.favicon);
              }
              // Sync to backend on URL or title changes
              if (event.changes.url || event.changes.title) {
                syncTabsToBackend(context.tabs);
              }
            },
          ],
        },
        'IPC.ACTIVE_TAB_CHANGED': {
          actions: assign(({ context, event }) => {
            const tab = context.tabs.find(t => t.id === event.tabId);
            return {
              activeTabId: event.tabId,
              ...(context.isAddressBarFocused ? {} : { addressBarValue: tab?.url ?? '' }),
            };
          }),
        },
      },
    },
  },
});

export default browserState;
