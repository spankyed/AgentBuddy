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
        createTab: (url?: string) => Promise<BrowserTabState | null>;
        closeTab: (tabId: number) => Promise<void>;
        selectTab: (tabId: number) => Promise<void>;
        navigate: (tabId: number, url: string) => Promise<void>;
        goBack: (tabId: number) => Promise<void>;
        goForward: (tabId: number) => Promise<void>;
        reload: (tabId: number) => Promise<void>;
        stop: (tabId: number) => Promise<void>;
        setBounds: (bounds: {x: number; y: number; width: number; height: number}) => void;
        show: () => void;
        hide: () => void;
        onTabCreated: (callback: (tab: BrowserTabState) => void) => () => void;
        onTabRemoved: (callback: (tabId: number) => void) => () => void;
        onTabUpdated: (callback: (tabId: number, changes: Partial<BrowserTabState>) => void) => () => void;
        onActiveTabChanged: (callback: (tabId: number) => void) => () => void;
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
  }
}

export {};