import type {DemoFixture} from '../types';

const timestamp = new Date('2026-05-23T10:30:00.000Z').getTime();

const artifacts = [
  {
    id: 'artifact-plan',
    title: 'Launch Demo Plan',
    type: 'plan',
    timestamp,
    content: {
      status: 'in-progress',
      branch: 'demo/product-intro',
      notes: [
        '## Product intro demo',
        '',
        '1. Stabilize the workspace scene.',
        '2. Generate the chat walkthrough from fixture data.',
        '3. Capture the artifact review as a faithful Electron frame.',
      ].join('\n'),
      steps: [
        {id: 'step-1', title: 'Workspace capture', status: 'completed'},
        {id: 'step-2', title: 'Chat capture', status: 'in-progress'},
        {id: 'step-3', title: 'Artifact capture', status: 'pending'},
      ],
    },
  },
  {
    id: 'artifact-notes',
    title: 'Demo Talking Points',
    type: 'markdown',
    timestamp,
    content: [
      '## AgentBuddy workflow',
      '',
      '- Keep project context, agent chat, and generated artifacts in one working surface.',
      '- Use fixtures to demo real UI states without reaching into random component internals.',
      '- Compose final product videos from deterministic Electron captures.',
    ].join('\n'),
  },
];

const thread = {
  id: 'thread-product-intro',
  shortCode: 'DEMO-101',
  topic: 'Create a product intro video from real app states',
  instructions: 'Use the real AgentBuddy renderer and deterministic fixture data for the demo capture.',
  status: 'active',
  timestamp,
  tags: ['demo', 'video'],
  pinned: true,
  forcedMode: 'Plan',
  chatState: 'working',
  context: {
    claudeCode: {
      cwd: '/Users/demo/agentbuddy',
    },
  },
  messages: [
    {
      id: 'msg-1',
      sender: 'user',
      text: 'Build a short product demo video using the actual Electron UI, not a recreated React screen.',
      createdAt: timestamp,
      forkable: false,
    },
    {
      id: 'msg-2',
      sender: 'assistant',
      text: 'I will capture deterministic Electron scenes for workspace, chat, and artifact review, then let Remotion handle only the overlays and pacing.',
      createdAt: timestamp + 45_000,
    },
    {
      id: 'msg-3',
      sender: 'assistant',
      text: 'The first fixture is ready: one thread, seeded artifacts, fixed panel sizes, and stable timestamps for reproducible screenshots.',
      createdAt: timestamp + 95_000,
    },
  ],
  artifacts,
};

export const productIntroFixture: DemoFixture = {
  id: 'product-intro',
  thread,
  threads: [
    thread,
    {
      id: 'thread-import-workspace',
      shortCode: 'DEMO-099',
      topic: 'Import workspace context',
      instructions: '',
      status: 'done',
      timestamp: timestamp - 86_400_000,
      tags: ['workspace'],
    },
    {
      id: 'thread-review-artifacts',
      shortCode: 'DEMO-100',
      topic: 'Review generated artifacts',
      instructions: '',
      status: 'review',
      timestamp: timestamp - 43_200_000,
      tags: ['artifact'],
    },
  ],
  artifacts,
  settings: {
    tags: [
      {id: 'demo', label: 'Demo', color: '#14b8a6'},
      {id: 'video', label: 'Video', color: '#38bdf8'},
      {id: 'workspace', label: 'Workspace', color: '#a3e635'},
      {id: 'artifact', label: 'Artifact', color: '#f59e0b'},
    ],
    chat: {
      modes: [
        {
          name: 'Plan',
          phases: [{name: 'Scope'}, {name: 'Implement'}, {name: 'Review'}],
        },
        {
          name: 'Build',
          phases: [{name: 'Code'}, {name: 'Verify'}],
        },
      ],
      defaultMode: 'Plan',
      defaultPhase: 'Implement',
      hotkeys: {},
      quickPrompts: [],
    },
    chatStates: [
      {id: 'working', label: 'Working', busy: true},
      {id: 'idle', label: 'Idle'},
    ],
  },
  scenes: {
    workspace: {
      panelSizes: {canvasHeight: 64, inspectionWidth: 420, chatMaximized: false},
      selectedArtifactId: 'artifact-plan',
    },
    chat: {
      panelSizes: {canvasHeight: 18, inspectionWidth: 0, chatMaximized: false},
      selectedArtifactId: 'artifact-plan',
    },
    artifact: {
      panelSizes: {canvasHeight: 72, inspectionWidth: 0, chatMaximized: false},
      selectedArtifactId: 'artifact-notes',
    },
  },
};
