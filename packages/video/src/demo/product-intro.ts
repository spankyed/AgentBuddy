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
  cameraTargetId: string;
};

export type DemoMoment = {
  id: string;
  chapter: string;
  durationInFrames: number;
  captures: Array<{
    id: string;
    electronScene: string;
  }>;
  motion: {
    type: 'stream' | 'type' | 'switch' | 'drag' | 'montage' | 'terminal' | 'graph' | 'final';
    cameraTargetId?: string;
    cursorPath?: Array<{x: number; y: number; frame: number}>;
  };
  copy?: {
    kicker?: string;
    headline?: string;
    subline?: string;
  };
};

const captureIds = [
  'chat_empty',
  'chat_reference_note',
  'chat_image_pasted',
  'chat_streaming',
  'chat_done',
  'chat_quick_prompt',
  'thread_pinned',
  'ticket_created',
  'kanban_before',
  'kanban_after',
  'note_open',
  'note_editing',
  'note_image_inserted',
  'note_thread_pill',
  'tasks_before',
  'tasks_after',
  'code_changes',
  'commit_message_generated',
  'branch_published',
  'pr_created',
  'terminal_start',
  'local_app_launched',
  'workflow_graph',
  'command_listener',
  'command_defined',
  'automation_running',
  'brain_graph',
  'logs_stream',
  'database_query',
  'settings_personalization',
  'threads_dashboard',
  'workflow_execution',
] as const;

type CaptureId = (typeof captureIds)[number];

const cameraTargets: Record<CaptureId, string> = {
  chat_empty: 'agent-chat-input',
  chat_reference_note: 'chat-area',
  chat_image_pasted: 'chat-area',
  chat_streaming: 'chat-area',
  chat_done: 'chat-area',
  chat_quick_prompt: 'agent-chat-input',
  thread_pinned: 'agent-artifacts',
  ticket_created: 'canvas-area',
  kanban_before: 'canvas-area',
  kanban_after: 'canvas-area',
  note_open: 'canvas-area',
  note_editing: 'canvas-area',
  note_image_inserted: 'canvas-area',
  note_thread_pill: 'agent-artifacts',
  tasks_before: 'canvas-area',
  tasks_after: 'canvas-area',
  code_changes: 'canvas-area',
  commit_message_generated: 'canvas-area',
  branch_published: 'canvas-area',
  pr_created: 'canvas-area',
  terminal_start: 'canvas-area',
  local_app_launched: 'canvas-area',
  workflow_graph: 'flow-editor-canvas',
  command_listener: 'canvas-area',
  command_defined: 'action-function-editor',
  automation_running: 'flow-editor-canvas',
  brain_graph: 'brain-flow-graph',
  logs_stream: 'canvas-area',
  database_query: 'canvas-area',
  settings_personalization: 'canvas-area',
  threads_dashboard: 'canvas-area',
  workflow_execution: 'flow-editor-canvas',
};

export const cinematicProductDemoScenes: CinematicProductDemoScene[] = captureIds.map(id => ({
  id,
  filename: `${id}.png`,
  cameraTargetId: cameraTargets[id],
}));

const capture = (id: CaptureId) => ({id, electronScene: id});
const captures = (...ids: CaptureId[]) => ids.map(capture);

export const cinematicProductDemoMoments: DemoMoment[] = [
  {
    id: 'chat-becomes-work',
    chapter: 'AI chat',
    durationInFrames: 285,
    captures: captures('chat_empty', 'chat_reference_note', 'chat_image_pasted', 'chat_streaming', 'chat_done'),
    motion: {type: 'stream', cameraTargetId: 'chat-area'},
    copy: {headline: 'Conversation becomes work.'},
  },
  {
    id: 'thread-to-ticket',
    chapter: 'Threads',
    durationInFrames: 170,
    captures: captures('chat_quick_prompt', 'thread_pinned', 'ticket_created'),
    motion: {type: 'switch', cameraTargetId: 'agent-artifacts'},
  },
  {
    id: 'kanban-move',
    chapter: 'Execution',
    durationInFrames: 185,
    captures: captures('kanban_before', 'kanban_after'),
    motion: {type: 'drag', cameraTargetId: 'canvas-area'},
  },
  {
    id: 'notes-memory',
    chapter: 'Notes',
    durationInFrames: 210,
    captures: captures('note_open', 'note_editing', 'note_image_inserted', 'note_thread_pill'),
    motion: {type: 'type', cameraTargetId: 'canvas-area'},
    copy: {headline: 'Memory stays connected.'},
  },
  {
    id: 'tasks-organize',
    chapter: 'Tasks',
    durationInFrames: 150,
    captures: captures('tasks_before', 'tasks_after'),
    motion: {type: 'drag', cameraTargetId: 'canvas-area'},
  },
  {
    id: 'code-ship',
    chapter: 'Code',
    durationInFrames: 245,
    captures: captures('code_changes', 'commit_message_generated', 'branch_published', 'pr_created'),
    motion: {type: 'switch', cameraTargetId: 'canvas-area'},
    copy: {headline: 'Ship from the same surface.'},
  },
  {
    id: 'terminal-loop',
    chapter: 'Local loop',
    durationInFrames: 165,
    captures: captures('terminal_start', 'local_app_launched'),
    motion: {type: 'terminal', cameraTargetId: 'canvas-area'},
  },
  {
    id: 'workflow-build',
    chapter: 'Automation',
    durationInFrames: 235,
    captures: captures('workflow_graph', 'command_listener', 'command_defined', 'automation_running'),
    motion: {type: 'graph', cameraTargetId: 'flow-editor-canvas'},
    copy: {headline: 'Automate the system around you.'},
  },
  {
    id: 'rapid-montage-a',
    chapter: 'System',
    durationInFrames: 185,
    captures: captures('brain_graph', 'logs_stream', 'database_query'),
    motion: {type: 'montage', cameraTargetId: 'canvas-area'},
  },
  {
    id: 'rapid-montage-b',
    chapter: 'Workspace',
    durationInFrames: 185,
    captures: captures('settings_personalization', 'threads_dashboard', 'workflow_execution'),
    motion: {type: 'montage', cameraTargetId: 'canvas-area'},
  },
  {
    id: 'final-lockup',
    chapter: 'AgentBuddy',
    durationInFrames: 255,
    captures: captures('threads_dashboard', 'workflow_execution', 'chat_done'),
    motion: {type: 'final', cameraTargetId: 'canvas-area'},
    copy: {
      headline: 'AgentBuddy',
      subline: 'The AI operating system for modern work.',
    },
  },
];

export const cinematicProductDemo = {
  id: 'cinematic-product-demo',
  compositionId: 'CinematicProductDemo',
  width: 1440,
  height: 900,
  fps: 30,
  durationInFrames: cinematicProductDemoMoments.reduce((sum, moment) => sum + moment.durationInFrames, 0),
  scenes: cinematicProductDemoScenes,
  moments: cinematicProductDemoMoments,
};

export function getDemoDefinition(id: string) {
  if (id === productIntroDemo.id) return productIntroDemo;
  if (id === cinematicProductDemo.id) return cinematicProductDemo;

  throw new Error(`Unknown demo "${id}".`);
}
