import type {SpeechEvent} from '../../../types/speech.js';

declare global {
  interface Window {
    electronAPI?: {
      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      fileUtils: {
        selectDirectory: () => Promise<string | null>;
        selectPath: (options?: {
          allowMultiple?: boolean;
          type: 'file' | 'directory' | 'both';
        }) => Promise<string | string[] | null>;
        readFile: (filePath: string) => Promise<string>;
        readFileBase64: (filePath: string) => Promise<string>;
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
        showItemInFolder: (filePath: string) => Promise<void>;
        openPath: (filePath: string) => Promise<void>;
      };
      media: {
        upload: (entityId: string, base64Data: string, mimeType: string) => Promise<string>;
        delete: (entityId: string, filename: string) => Promise<void>;
        deleteAll: (entityId: string) => Promise<void>;
      };
      speechRecognition: {
        start: (lang?: string) => Promise<void>;
        stop: () => Promise<void>;
        isAvailable: () => Promise<{ available: boolean }>;
        onEvent: (callback: (event: SpeechEvent) => void) => () => void;
      };
      zoom: {
        getZoomFactor: () => number;
        notifyZoomChanged: (factor: number) => void;
      };
      apiStatus: {
        getStatus: () => Promise<{
          running: boolean;
          port?: number;
          error?: { message: string; stack?: string };
          restartAttempts: number;
        }>;
        relaunch: () => Promise<void>;
        onEvent: (callback: (event: { type: string; error?: string; attempt?: number; maxAttempts?: number }) => void) => () => void;
      };
      browser: {
        createTab: (url?: string, options?: { lazy?: boolean; title?: string; favicon?: string }) => Promise<BrowserTabState | null>;
        loadTab: (tabId: number) => Promise<void>;
        closeTab: (tabId: number) => void;
        selectTab: (tabId: number) => void;
        navigate: (tabId: number, url: string) => void;
        goBack: (tabId: number) => void;
        goForward: (tabId: number) => void;
        reload: (tabId: number) => void;
        stop: (tabId: number) => void;
        setBounds: (bounds: {x: number; y: number; width: number; height: number}) => void;
        show: () => void;
        hide: () => void;
        onTabCreated: (callback: (tab: BrowserTabState) => void) => () => void;
        onTabRemoved: (callback: (tabId: number) => void) => () => void;
        onTabUpdated: (callback: (tabId: number, changes: Partial<BrowserTabState>) => void) => () => void;
        onActiveTabChanged: (callback: (tabId: number) => void) => () => void;
        toggleDevTools: (tabId: number) => void;
        onFocusAddressBar: (callback: () => void) => () => void;
        duplicateTab: (tabId: number) => Promise<BrowserTabState | null>;
        setTabMuted: (tabId: number, muted: boolean) => Promise<void>;
        getTabs: () => Promise<BrowserTabState[]>;
        getActiveTab: () => Promise<number | null>;
      };
      apiPort: number;
    };
  }

  interface BrowserTabState {
    id: number;
    url: string;
    title: string;
    favicon: string;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    isMuted: boolean;
  }
}

export {};