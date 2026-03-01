import type { FlowDSL } from '@/systems/flows/dsl/types';

/* ── Context maps ──────────────────────────────────────────────── */

export const ctx = {
  actions: new Map([
    ['sendEmail', 'Action-send-123'],
    ['myAction', 'Action-my-001'],
  ]),
  prompts: new Map([
    ['classify', 'Prompt-cls-456'],
  ]),
};

/* ── Step fixtures ─────────────────────────────────────────────── */

export const steps = {
  // action variants
  action: {
    type: 'action' as const,
    action: 'sendEmail',
    params: { to: 'user@test.com' },
    map: { subject: '$.data.title' },
  },
  actionParams: {
    type: 'action' as const,
    action: 'sendEmail',
    params: { to: 'user@test.com', subject: 'Hi' },
  },
  actionMap: {
    type: 'action' as const,
    action: 'processData',
    map: { input: '$.data.value', key: '$.data.id' },
  },
  actionLabeled: {
    type: 'action' as const,
    action: 'myAction',
    label: 'Custom Label',
    description: 'Does something important',
  },
  actionFinal: {
    type: 'action' as const,
    action: 'lastStep',
    final: true,
  },
  actionFieldMap: {
    type: 'action' as const,
    action: 'process',
    map: { name: '$.data.name', age: '$.data.age' },
  },

  // llm variants
  llm: {
    type: 'llm' as const,
    prompt: 'classify',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 500,
    systemPrompt: 'You are helpful',
    map: { input: '$.data.text' },
  },
  llmBasic: {
    type: 'llm' as const,
    prompt: 'classify',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 500,
    systemPrompt: 'You are helpful',
  },

  // fire, transform, query
  fire: {
    type: 'fire' as const,
    event: 'notify.sent',
    scope: 'global',
    payload: { msg: 'hello' },
  },
  transform: {
    type: 'transform' as const,
    script: 'return x + 1',
    outputType: 'text',
  },
  query: {
    type: 'query' as const,
    prompt: 'Find user by name',
    as: 'foundUser',
  },

  // flow ref
  flowRef: {
    type: 'flow' as const,
    flow: 'Child',
    inherit: false,
    map: { userId: '$.data.id' },
  },

  // data nodes
  create: { type: 'create' as const, entity: 'Thread' },
  update: { type: 'update' as const, target: 'some-entity', onMissing: 'ignore' },
  keepAlive: { type: 'keep_alive' as const },
};

/* ── Named flow DSLs ──────────────────────────────────────────── */

export const flows = {
  parentChild: {
    'Parent': [{ event: 'go', steps: [steps.flowRef] }],
    'Child': [{ event: 'start', steps: [] }],
  } as FlowDSL,

  simple: {
    'Simple': [{
      event: 'start',
      steps: [{ type: 'action', action: 'doSomething' }],
    }],
  } as FlowDSL,

  multiStep: {
    'Multi': [{
      event: 'start',
      steps: [
        { type: 'action', action: 'first' },
        { type: 'action', action: 'second' },
        { type: 'action', action: 'third' },
      ],
    }],
  } as FlowDSL,

  labeled: {
    'Labeled': [{ event: 'start', steps: [steps.actionLabeled] }],
  } as FlowDSL,

  final: {
    'Final': [{ event: 'start', steps: [steps.actionFinal] }],
  } as FlowDSL,

  multiTrack: {
    'MultiTrack': [
      { event: 'user.created', steps: [{ type: 'action', action: 'welcome' }] },
      { event: 'user.updated', steps: [{ type: 'action', action: 'sync' }] },
    ],
  } as FlowDSL,

  twoLabeledTracks: {
    'F': [
      { event: 'ev1', label: 'Track A', steps: [{ type: 'action', action: 'a' }] },
      { event: 'ev2', label: 'Track B', steps: [{ type: 'action', action: 'b' }] },
    ],
  } as FlowDSL,

  empty: {
    'Empty': [{ event: 'start', steps: [] }],
  } as FlowDSL,
};
