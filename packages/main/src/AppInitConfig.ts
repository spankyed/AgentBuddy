export type AppInitConfig = {
  preload: {
    path: string;
  };

  renderer:
    | {
        path: string;
      }
    | URL;

  demoCapture?: {
    enabled: true;
    id: string;
    scene: string;
    captureOutput: string;
  };
};
