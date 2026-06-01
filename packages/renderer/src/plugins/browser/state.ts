import { setup, assign, fromCallback, type ActorRefFrom } from 'xstate';

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
}

type BrowserEvents =
  // UI events
  | { type: 'TAB.CREATE'; url?: string }
  | { type: 'TAB.CLOSE'; tabId: number }
  | { type: 'TAB.SELECT'; tabId: number }
  | { type: 'TAB.DUPLICATE'; tabId: number }
  | { type: 'TAB.CLOSE_OTHERS'; tabId: number }
  | { type: 'TAB.TOGGLE_MUTE'; tabId: number }
  | { type: 'NAV.GO'; url: string }
  | { type: 'NAV.BACK' }
  | { type: 'NAV.FORWARD' }
  | { type: 'NAV.RELOAD' }
  | { type: 'NAV.STOP' }
  | { type: 'NAV.TOGGLE_DEVTOOLS' }
  | { type: 'ADDRESS_BAR.UPDATE'; value: string }
  | { type: 'ADDRESS_BAR.FOCUS' }
  | { type: 'ADDRESS_BAR.BLUR' }
  // IPC bridge events
  | { type: 'IPC.TAB_CREATED'; tab: BrowserTab }
  | { type: 'IPC.TAB_REMOVED'; tabId: number }
  | { type: 'IPC.TAB_UPDATED'; tabId: number; changes: Partial<BrowserTab> }
  | { type: 'IPC.ACTIVE_TAB_CHANGED'; tabId: number };

export type BrowserState = ActorRefFrom<typeof browserState>;

function navAction(method: 'goBack' | 'goForward' | 'reload' | 'stop') {
  return ({ context }: { context: { activeTabId: number | null } }) => {
    if (context.activeTabId !== null) {
      window.electronAPI?.browser[method](context.activeTabId);
    }
  };
}

const browserState = setup({
  types: {
    context: {} as {
      tabs: BrowserTab[];
      activeTabId: number | null;
      addressBarValue: string;
      isAddressBarFocused: boolean;
    },
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
      if (context.activeTabId !== null && context.addressBarValue.trim()) {
        window.electronAPI?.browser.navigate(context.activeTabId, context.addressBarValue.trim());
      }
    },
    goBack: navAction('goBack'),
    goForward: navAction('goForward'),
    reload: navAction('reload'),
    stop: navAction('stop'),
    toggleDevTools: ({ context }) => {
      if (context.activeTabId !== null) {
        window.electronAPI?.browser.toggleDevTools(context.activeTabId);
      }
    },
  },
}).createMachine({
  id,
  initial: 'active',
  context: {
    tabs: [],
    activeTabId: null,
    addressBarValue: '',
    isAddressBarFocused: false,
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
        'NAV.GO': {
          actions: [
            assign({ addressBarValue: ({ event }) => event.url }),
            'navigate',
          ],
        },
        'NAV.BACK': { actions: 'goBack' },
        'NAV.FORWARD': { actions: 'goForward' },
        'NAV.RELOAD': { actions: 'reload' },
        'NAV.STOP': { actions: 'stop' },
        'NAV.TOGGLE_DEVTOOLS': { actions: 'toggleDevTools' },
        'ADDRESS_BAR.UPDATE': {
          actions: assign({ addressBarValue: ({ event }) => event.value }),
        },
        'ADDRESS_BAR.FOCUS': {
          actions: assign({ isAddressBarFocused: true }),
        },
        'ADDRESS_BAR.BLUR': {
          actions: assign({ isAddressBarFocused: false }),
        },
        // IPC events — inline assigns, no named actions needed
        'IPC.TAB_CREATED': {
          actions: assign({
            tabs: ({ context, event }) =>
              context.tabs.some(t => t.id === event.tab.id)
                ? context.tabs
                : [...context.tabs, event.tab],
          }),
        },
        'IPC.TAB_REMOVED': {
          actions: assign(({ context, event }) => {
            const tabs = context.tabs.filter(t => t.id !== event.tabId);
            return {
              tabs,
              activeTabId: context.activeTabId === event.tabId
                ? (tabs.at(-1)?.id ?? null)
                : context.activeTabId,
            };
          }),
        },
        'IPC.TAB_UPDATED': {
          actions: assign(({ context, event }) => {
            const tabs = context.tabs.map(t =>
              t.id === event.tabId ? { ...t, ...event.changes } : t,
            );
            const syncUrl = !context.isAddressBarFocused
              && event.tabId === context.activeTabId
              && event.changes.url !== undefined;
            return {
              tabs,
              ...(syncUrl ? { addressBarValue: event.changes.url } : {}),
            };
          }),
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
