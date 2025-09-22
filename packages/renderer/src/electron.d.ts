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
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
      };
      apiPort: number;
    };
  }
}

export {};