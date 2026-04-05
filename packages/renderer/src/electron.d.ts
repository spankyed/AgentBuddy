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
        onEvent: (callback: (event: { type: string; error?: string; attempt?: number; maxAttempts?: number }) => void) => () => void;
      };
      appUpdate: {
        onUpdateAvailable: (cb: (info: { version: string; releaseNotes?: string | { version: string; note: string }[] }) => void) => () => void;
        onDownloadProgress: (cb: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => () => void;
        onUpdateDownloaded: (cb: (info: { version: string; releaseNotes?: string | { version: string; note: string }[] }) => void) => () => void;
        onUpdateError: (cb: (message: string) => void) => () => void;
        startDownload: () => Promise<void>;
        installAndRestart: () => Promise<void>;
        dismissUpdate: (version: string) => Promise<void>;
      };
      apiPort: number;
    };
  }
}

export {};