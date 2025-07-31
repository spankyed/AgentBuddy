declare global {
  interface Window {
    electronAPI?: {
      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
    };
  }
}

export {};