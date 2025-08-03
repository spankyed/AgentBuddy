declare global {
  interface Window {
    electronAPI?: {
      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      fileUtils: {
        getPathForFile: (file: File) => string;
      };
    };
  }
}

export {};