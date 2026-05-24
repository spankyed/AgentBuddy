export interface DemoConfig {
  enabled: true;
  id: string;
  scene: string;
}

export interface DemoSceneConfig {
  pluginId?: string;
  targetView?: string;
  threadView?: 'dashboard' | 'list' | 'kanban';
  panelSizes: {
    canvasHeight: number;
    inspectionWidth: number;
    chatMaximized?: boolean;
  };
  selectedArtifactId?: string;
}

export interface DemoFixture {
  id: string;
  thread: any;
  threads: any[];
  artifacts: any[];
  settings: any;
  scenes: Record<string, DemoSceneConfig>;
}
