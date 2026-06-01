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
}

export interface BrowserContext {
  tabs: BrowserTab[];
  activeTabId: number | null;
  addressBarValue: string;
  isAddressBarFocused: boolean;
}

type BrowserEvents =
  // UI events
  | { type: 'TAB.CREATE'; url?: string }
  | { type: 'TAB.CLOSE'; tabId: number }
  | { type: 'TAB.SELECT'; tabId: number }
  | { type: 'NAV.GO'; url: string }
  | { type: 'NAV.BACK' }
  | { type: 'NAV.FORWARD' }
  | { type: 'NAV.RELOAD' }
  | { type: 'NAV.STOP' }
  | { type: 'ADDRESS_BAR.UPDATE'; value: string }
  | { type: 'ADDRESS_BAR.FOCUS' }
  | { type: 'ADDRESS_BAR.BLUR' }
  // IPC bridge events
  | { type: 'IPC.TAB_CREATED'; tab: BrowserTab }
  | { type: 'IPC.TAB_REMOVED'; tabId: number }
  | { type: 'IPC.TAB_UPDATED'; tabId: number; changes: Partial<BrowserTab> }
  | { type: 'IPC.ACTIVE_TAB_CHANGED'; tabId: number };

export type BrowserState = ActorRefFrom<typeof browserState>;

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
        api.onTabCreated((tab) => {
          sendBack({ type: 'IPC.TAB_CREATED', tab });
        }),
        api.onTabRemoved((tabId) => {
          sendBack({ type: 'IPC.TAB_REMOVED', tabId });
        }),
        api.onTabUpdated((tabId, changes) => {
          sendBack({ type: 'IPC.TAB_UPDATED', tabId, changes });
        }),
        api.onActiveTabChanged((tabId) => {
          sendBack({ type: 'IPC.ACTIVE_TAB_CHANGED', tabId });
        }),
      ];

      return () => {
        unsubs.forEach(unsub => unsub());
      };
    }),
  },
  actions: {
    createTab: (_, params: { url?: string }) => {
      window.electronAPI?.browser.createTab(params.url);
    },
    closeTab: (_, params: { tabId: number }) => {
      window.electronAPI?.browser.closeTab(params.tabId);
    },
    selectTab: (_, params: { tabId: number }) => {
      window.electronAPI?.browser.selectTab(params.tabId);
    },
    navigate: ({ context }) => {
      if (context.activeTabId !== null && context.addressBarValue.trim()) {
        window.electronAPI?.browser.navigate(context.activeTabId, context.addressBarValue.trim());
      }
    },
    goBack: ({ context }) => {
      if (context.activeTabId !== null) {
        window.electronAPI?.browser.goBack(context.activeTabId);
      }
    },
    goForward: ({ context }) => {
      if (context.activeTabId !== null) {
        window.electronAPI?.browser.goForward(context.activeTabId);
      }
    },
    reload: ({ context }) => {
      if (context.activeTabId !== null) {
        window.electronAPI?.browser.reload(context.activeTabId);
      }
    },
    stop: ({ context }) => {
      if (context.activeTabId !== null) {
        window.electronAPI?.browser.stop(context.activeTabId);
      }
    },
    addTab: assign({
      tabs: ({ context, event }) => {
        if (event.type !== 'IPC.TAB_CREATED') return context.tabs;
        // Avoid duplicates
        if (context.tabs.some(t => t.id === event.tab.id)) return context.tabs;
        return [...context.tabs, event.tab];
      },
    }),
    removeTab: assign(({ context, event }) => {
      if (event.type !== 'IPC.TAB_REMOVED') return {};
      const tabs = context.tabs.filter(t => t.id !== event.tabId);
      const activeTabId = context.activeTabId === event.tabId
        ? (tabs.length > 0 ? tabs[tabs.length - 1].id : null)
        : context.activeTabId;
      return { tabs, activeTabId };
    }),
    updateTab: assign({
      tabs: ({ context, event }) => {
        if (event.type !== 'IPC.TAB_UPDATED') return context.tabs;
        return context.tabs.map(t =>
          t.id === event.tabId ? { ...t, ...event.changes } : t,
        );
      },
    }),
    syncAddressBar: assign(({ context, event }) => {
      if (event.type !== 'IPC.TAB_UPDATED') return {};
      if (context.isAddressBarFocused) return {};
      if (event.tabId !== context.activeTabId) return {};
      if (event.changes.url !== undefined) {
        return { addressBarValue: event.changes.url };
      }
      return {};
    }),
    setActiveTab: assign(({ event }) => {
      if (event.type !== 'IPC.ACTIVE_TAB_CHANGED') return {};
      return { activeTabId: event.tabId };
    }),
    syncAddressBarOnTabSwitch: assign(({ context, event }) => {
      if (event.type !== 'IPC.ACTIVE_TAB_CHANGED') return {};
      if (context.isAddressBarFocused) return {};
      const tab = context.tabs.find(t => t.id === event.tabId);
      return { addressBarValue: tab?.url || '' };
    }),
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
  invoke: {
    src: 'ipcBridge',
  },
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
        'ADDRESS_BAR.UPDATE': {
          actions: assign({ addressBarValue: ({ event }) => event.value }),
        },
        'ADDRESS_BAR.FOCUS': {
          actions: assign({ isAddressBarFocused: true }),
        },
        'ADDRESS_BAR.BLUR': {
          actions: assign({ isAddressBarFocused: false }),
        },
        // IPC events
        'IPC.TAB_CREATED': {
          actions: ['addTab'],
        },
        'IPC.TAB_REMOVED': {
          actions: ['removeTab'],
        },
        'IPC.TAB_UPDATED': {
          actions: ['updateTab', 'syncAddressBar'],
        },
        'IPC.ACTIVE_TAB_CHANGED': {
          actions: ['setActiveTab', 'syncAddressBarOnTabSwitch'],
        },
      },
    },
  },
});

export default browserState;
