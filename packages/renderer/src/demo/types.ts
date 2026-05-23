export type DemoSceneId = 'workspace' | 'chat' | 'artifact';

export interface DemoConfig {
  enabled: true;
  id: string;
  scene: DemoSceneId;
}

export interface DemoFixture {
  id: string;
  thread: any;
  threads: any[];
  artifacts: any[];
  settings: any;
  scenes: Record<DemoSceneId, {
    panelSizes: {
      canvasHeight: number;
      inspectionWidth: number;
      chatMaximized?: boolean;
    };
    selectedArtifactId?: string;
  }>;
}
