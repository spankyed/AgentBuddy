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

export type CinematicProductDemoScene = {
  id: string;
  filename: string;
  chapter: string;
  headline: string;
  subline: string;
  cameraTargetId: string;
  durationInFrames: number;
  intensity: number;
};

export const cinematicProductDemoScenes: CinematicProductDemoScene[] = [
  {
    id: 'ai_thread_stream',
    filename: 'ai_thread_stream.png',
    chapter: 'More than AI chat',
    headline: 'Conversation becomes work.',
    subline: 'Threads carry context, artifacts, and decisions without switching tools.',
    cameraTargetId: 'chat-area',
    durationInFrames: 240,
    intensity: 0.25,
  },
  {
    id: 'thread_workspace',
    filename: 'thread_workspace.png',
    chapter: 'Connected workspace',
    headline: 'Every thread has a surface.',
    subline: 'The canvas turns discussion into durable workspace state.',
    cameraTargetId: 'canvas-area',
    durationInFrames: 225,
    intensity: 0.28,
  },
  {
    id: 'thread_kanban',
    filename: 'thread_kanban.png',
    chapter: 'Momentum',
    headline: 'Ideas move into execution.',
    subline: 'Tasks, status, and parent context stay connected.',
    cameraTargetId: 'canvas-area',
    durationInFrames: 195,
    intensity: 0.35,
  },
  {
    id: 'notes_editor',
    filename: 'notes_editor.png',
    chapter: 'More than notes',
    headline: 'Memory is editable.',
    subline: 'Notes, references, and project context live beside the agent.',
    cameraTargetId: 'canvas-area',
    durationInFrames: 195,
    intensity: 0.38,
  },
  {
    id: 'notes_tasks',
    filename: 'notes_tasks.png',
    chapter: 'Context, organized',
    headline: 'Plans stay close to action.',
    subline: 'Capture intent once, reuse it everywhere.',
    cameraTargetId: 'canvas-area',
    durationInFrames: 165,
    intensity: 0.42,
  },
  {
    id: 'code_changes',
    filename: 'code_changes.png',
    chapter: 'More than an IDE',
    headline: 'Ship without ceremony.',
    subline: 'Code, git, review, and automation move as one workflow.',
    cameraTargetId: 'canvas-area',
    durationInFrames: 195,
    intensity: 0.5,
  },
  {
    id: 'code_terminal',
    filename: 'code_terminal.png',
    chapter: 'Local systems',
    headline: 'Terminal, app, agent: one loop.',
    subline: 'Start, inspect, revise, and relaunch without leaving the workspace.',
    cameraTargetId: 'chat-area',
    durationInFrames: 165,
    intensity: 0.55,
  },
  {
    id: 'branch_publish',
    filename: 'branch_publish.png',
    chapter: 'Git velocity',
    headline: 'From change to PR in seconds.',
    subline: 'Commit messages, branches, and reviews become assisted actions.',
    cameraTargetId: 'canvas-area',
    durationInFrames: 165,
    intensity: 0.58,
  },
  {
    id: 'workflow_graph',
    filename: 'workflow_graph.png',
    chapter: 'More than workflows',
    headline: 'Automation is programmable.',
    subline: 'Build command-driven systems from reusable nodes.',
    cameraTargetId: 'flow-editor-canvas',
    durationInFrames: 165,
    intensity: 0.64,
  },
  {
    id: 'command_listener',
    filename: 'command_listener.png',
    chapter: 'Command layer',
    headline: '/replace-obsolete-apps',
    subline: 'Notion. Obsidian. TickTick. Cursor. VSCode. AntiGravity.',
    cameraTargetId: 'canvas-area',
    durationInFrames: 150,
    intensity: 0.7,
  },
  {
    id: 'prompts_library',
    filename: 'prompts_library.png',
    chapter: 'Reusable intelligence',
    headline: 'Prompts become infrastructure.',
    subline: 'Codify how work should happen once, then run it everywhere.',
    cameraTargetId: 'canvas-area',
    durationInFrames: 150,
    intensity: 0.74,
  },
  {
    id: 'brain_system',
    filename: 'brain_system.png',
    chapter: 'Actor systems',
    headline: 'The workspace thinks in systems.',
    subline: 'Flows, events, and memory coordinate behind the interface.',
    cameraTargetId: 'brain-flow-graph',
    durationInFrames: 150,
    intensity: 0.8,
  },
  {
    id: 'logs_stream',
    filename: 'logs_stream.png',
    chapter: 'Operational clarity',
    headline: 'Everything observable.',
    subline: 'Logs, execution, and state changes stream through the same cockpit.',
    cameraTargetId: 'canvas-area',
    durationInFrames: 120,
    intensity: 0.86,
  },
  {
    id: 'database_memory',
    filename: 'database_memory.png',
    chapter: 'Living memory',
    headline: 'Knowledge is queryable.',
    subline: 'Data, relations, and context stay available to the agent.',
    cameraTargetId: 'canvas-area',
    durationInFrames: 120,
    intensity: 0.9,
  },
  {
    id: 'settings_personalization',
    filename: 'settings_personalization.png',
    chapter: 'Personal AI OS',
    headline: 'Your stack becomes personal.',
    subline: 'Models, tools, memory, and defaults adapt to how you work.',
    cameraTargetId: 'canvas-area',
    durationInFrames: 120,
    intensity: 0.94,
  },
  {
    id: 'final_workspace',
    filename: 'final_workspace.png',
    chapter: 'AgentBuddy',
    headline: 'The AI operating system for modern work.',
    subline: 'Conversation, code, notes, workflows, memory, and execution in one connected surface.',
    cameraTargetId: 'canvas-area',
    durationInFrames: 360,
    intensity: 1,
  },
];

export const cinematicProductDemo = {
  id: 'cinematic-product-demo',
  compositionId: 'CinematicProductDemo',
  width: 1440,
  height: 900,
  fps: 30,
  durationInFrames: cinematicProductDemoScenes.reduce((sum, scene) => sum + scene.durationInFrames, 0),
  scenes: cinematicProductDemoScenes,
};

export function getDemoDefinition(id: string) {
  if (id === productIntroDemo.id) return productIntroDemo;
  if (id === cinematicProductDemo.id) return cinematicProductDemo;

  throw new Error(`Unknown demo "${id}".`);
}
