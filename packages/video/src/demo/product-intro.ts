export type ProductIntroSceneId = 'workspace' | 'chat' | 'artifact';

export const productIntroScenes: Array<{
  id: ProductIntroSceneId;
  filename: string;
  caption: string;
  highlightTargetId: string;
  highlightLabel: string;
}> = [
  {
    id: 'workspace',
    filename: 'workspace.png',
    caption: 'Start from the real AgentBuddy workspace, seeded with deterministic project context.',
    highlightTargetId: 'canvas-area',
    highlightLabel: 'Threads canvas',
  },
  {
    id: 'chat',
    filename: 'chat.png',
    caption: 'Show the actual chat surface populated by fixture-backed app state.',
    highlightTargetId: 'chat-area',
    highlightLabel: 'Agent chat',
  },
  {
    id: 'artifact',
    filename: 'artifact.png',
    caption: 'Review generated artifacts from captured Electron UI, then compose the final video in Remotion.',
    highlightTargetId: 'agent-artifacts',
    highlightLabel: 'Artifact viewer',
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
