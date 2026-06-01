import {productIntroFixture} from './product-intro';
import type {DemoFixture, DemoSceneConfig} from '../types';

const panels = {
  balanced: {canvasHeight: 58, inspectionWidth: 0, chatMaximized: false},
  chat: {canvasHeight: 18, inspectionWidth: 0, chatMaximized: false},
  canvas: {canvasHeight: 76, inspectionWidth: 0, chatMaximized: false},
  canvasInspection: {canvasHeight: 70, inspectionWidth: 380, chatMaximized: false},
};

const timestamp = new Date('2026-05-23T10:30:00.000Z').getTime();

const chatMessages = {
  empty: [],
  reference: [
    {
      id: 'msg-ref-1',
      sender: 'user',
      text: 'Use the launch notes and turn them into the execution plan for this week.',
      createdAt: timestamp,
      forkable: false,
    },
  ],
  image: [
    {
      id: 'msg-img-1',
      sender: 'user',
      text: 'I pasted the onboarding screenshot. Extract the product story and convert it into work.',
      createdAt: timestamp,
      forkable: false,
    },
  ],
  streaming: [
    {
      id: 'msg-stream-1',
      sender: 'user',
      text: 'Turn this launch brief into tickets, notes, and a shippable PR plan.',
      createdAt: timestamp,
      forkable: false,
    },
    {
      id: 'msg-stream-2',
      sender: 'assistant',
      text: [
        'Reading the launch context...',
        '',
        '- Created the product film task list',
        '- Linked the memory note',
        '- Drafting branch and PR steps',
      ].join('\n'),
      createdAt: timestamp + 32_000,
    },
  ],
  done: [
    {
      id: 'msg-done-1',
      sender: 'user',
      text: 'Turn this launch brief into tickets, notes, and a shippable PR plan.',
      createdAt: timestamp,
      forkable: false,
    },
    {
      id: 'msg-done-2',
      sender: 'assistant',
      text: [
        'Done. I created the work surface and connected the artifacts.',
        '',
        '1. Launch Demo Plan is now in progress.',
        '2. The memory note is linked to the active thread.',
        '3. Code changes, commit message, and PR checklist are ready.',
      ].join('\n'),
      createdAt: timestamp + 70_000,
    },
  ],
};

const planArtifact = {
  ...productIntroFixture.artifacts[0],
  title: 'Launch Operating Plan',
  content: {
    ...productIntroFixture.artifacts[0].content,
    steps: [
      {id: 'step-1', title: 'Capture launch context', status: 'completed'},
      {id: 'step-2', title: 'Create execution tickets', status: 'completed'},
      {id: 'step-3', title: 'Generate branch and PR plan', status: 'in-progress'},
      {id: 'step-4', title: 'Automate release checks', status: 'pending'},
    ],
  },
};

const notesArtifact = {
  ...productIntroFixture.artifacts[1],
  title: 'Launch Memory',
  content: [
    '## Launch memory',
    '',
    '- AgentBuddy replaces disconnected chat, notes, task boards, code loops, and automation scripts.',
    '- The demo should show work crossing surfaces without handoff.',
    '- Final copy: The AI operating system for modern work.',
  ].join('\n'),
};

function threadFor(messages: any[], overrides: Record<string, any> = {}) {
  return {
    ...productIntroFixture.thread,
    topic: 'Launch AgentBuddy as the AI operating system for modern work',
    instructions: 'Convert launch context into notes, tickets, code changes, and reusable workflows.',
    chatState: overrides.chatState ?? 'working',
    messages,
    artifacts: overrides.artifacts ?? [planArtifact, notesArtifact],
    ...overrides,
  };
}

function threadsFor(activeThread: any, after = false) {
  return [
    activeThread,
    {
      id: 'thread-launch-ticket',
      shortCode: 'AB-214',
      topic: after ? 'Publish launch film cutdown' : 'Backlog: publish launch film cutdown',
      instructions: '',
      status: after ? 'active' : 'todo',
      timestamp: timestamp - 11_000,
      tags: ['demo', 'video'],
      pinned: after,
    },
    {
      id: 'thread-code-ship',
      shortCode: 'AB-215',
      topic: 'Ship capture-state Remotion renderer',
      instructions: '',
      status: after ? 'review' : 'todo',
      timestamp: timestamp - 21_000,
      tags: ['workspace'],
    },
    {
      id: 'thread-automation',
      shortCode: 'AB-216',
      topic: 'Automate release checks',
      instructions: '',
      status: 'in-progress',
      timestamp: timestamp - 31_000,
      tags: ['artifact'],
    },
  ];
}

function scene(config: DemoSceneConfig): DemoSceneConfig {
  return config;
}

const activeDoneThread = threadFor(chatMessages.done, {chatState: 'idle'});
const threadScene = (messages: any[], config: Partial<DemoSceneConfig> = {}) => scene({
  pluginId: 'threads',
  threadView: 'dashboard',
  panelSizes: panels.balanced,
  selectedArtifactId: 'artifact-plan',
  thread: threadFor(messages, {chatState: config.chatState ?? 'working'}),
  threads: threadsFor(threadFor(messages)),
  ...config,
});

export const cinematicProductDemoFixture: DemoFixture = {
  ...productIntroFixture,
  id: 'cinematic-product-demo',
  scenes: {
    chat_empty: threadScene(chatMessages.empty, {panelSizes: panels.chat, chatState: 'idle'}),
    chat_reference_note: threadScene(chatMessages.reference, {panelSizes: panels.chat}),
    chat_image_pasted: threadScene(chatMessages.image, {panelSizes: panels.chat}),
    chat_streaming: threadScene(chatMessages.streaming, {panelSizes: panels.chat}),
    chat_done: threadScene(chatMessages.done, {panelSizes: panels.chat, chatState: 'idle'}),
    chat_quick_prompt: threadScene(chatMessages.done, {panelSizes: panels.balanced, chatState: 'idle'}),
    thread_pinned: threadScene(chatMessages.done, {panelSizes: panels.balanced, thread: {...activeDoneThread, pinned: true}}),
    ticket_created: threadScene(chatMessages.done, {panelSizes: panels.balanced, threads: threadsFor(activeDoneThread, true)}),
    kanban_before: threadScene(chatMessages.done, {threadView: 'kanban', panelSizes: panels.canvas, threads: threadsFor(activeDoneThread, false)}),
    kanban_after: threadScene(chatMessages.done, {threadView: 'kanban', panelSizes: panels.canvas, threads: threadsFor(activeDoneThread, true)}),

    note_open: scene({pluginId: 'notes', panelSizes: panels.canvas}),
    note_editing: scene({pluginId: 'notes', panelSizes: panels.canvasInspection}),
    note_image_inserted: scene({pluginId: 'notes', panelSizes: panels.canvas}),
    note_thread_pill: threadScene(chatMessages.done, {panelSizes: panels.balanced, selectedArtifactId: 'artifact-notes'}),
    tasks_before: threadScene(chatMessages.done, {threadView: 'kanban', panelSizes: panels.canvas, threads: threadsFor(activeDoneThread, false)}),
    tasks_after: threadScene(chatMessages.done, {threadView: 'kanban', panelSizes: panels.canvas, threads: threadsFor(activeDoneThread, true)}),

    code_changes: scene({pluginId: 'code', panelSizes: panels.canvas}),
    commit_message_generated: scene({pluginId: 'code', panelSizes: panels.canvasInspection}),
    branch_published: scene({pluginId: 'code', panelSizes: panels.balanced}),
    pr_created: scene({pluginId: 'code', panelSizes: panels.balanced}),
    terminal_start: scene({pluginId: 'code', panelSizes: panels.chat}),
    local_app_launched: scene({pluginId: 'code', panelSizes: panels.chat}),

    workflow_graph: scene({pluginId: 'flows', targetView: 'dashboard', panelSizes: panels.canvas}),
    command_listener: scene({pluginId: 'actions', panelSizes: panels.canvas}),
    command_defined: scene({pluginId: 'actions', panelSizes: panels.canvasInspection}),
    automation_running: scene({pluginId: 'flows', targetView: 'dashboard', panelSizes: panels.canvas}),

    brain_graph: scene({pluginId: 'brain', panelSizes: panels.canvas}),
    logs_stream: scene({pluginId: 'logs', panelSizes: panels.canvas}),
    database_query: scene({pluginId: 'database', panelSizes: panels.canvas}),
    settings_personalization: scene({pluginId: 'settings', panelSizes: panels.canvas}),
    threads_dashboard: threadScene(chatMessages.done, {panelSizes: panels.balanced, selectedArtifactId: 'artifact-notes'}),
    workflow_execution: scene({pluginId: 'flows', targetView: 'dashboard', panelSizes: panels.canvas}),
  },
};
