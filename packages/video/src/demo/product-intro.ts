export type ProductIntroSceneId = 'workspace' | 'chat' | 'artifact';

export const productIntroScenes: Array<{
  id: ProductIntroSceneId;
  filename: string;
  caption: string;
  highlight: {x: number; y: number; width: number; height: number};
}> = [
  {
    id: 'workspace',
    filename: 'workspace.png',
    caption: 'Start from the real AgentBuddy workspace, seeded with deterministic project context.',
    highlight: {x: 90, y: 75, width: 900, height: 535},
  },
  {
    id: 'chat',
    filename: 'chat.png',
    caption: 'Show the actual chat surface populated by fixture-backed app state.',
    highlight: {x: 295, y: 155, width: 980, height: 560},
  },
  {
    id: 'artifact',
    filename: 'artifact.png',
    caption: 'Review generated artifacts from captured Electron UI, then compose the final video in Remotion.',
    highlight: {x: 300, y: 90, width: 1020, height: 610},
  },
];

export const productIntroDemo = {
  id: 'product-intro',
  compositionId: 'ElectronCaptureDemo',
  width: 1440,
  height: 900,
  fps: 30,
  durationInFrames: productIntroScenes.length * 120,
  scenes: productIntroScenes,
};

export function getDemoDefinition(id: string) {
  if (id !== productIntroDemo.id) {
    throw new Error(`Unknown demo "${id}".`);
  }

  return productIntroDemo;
}
