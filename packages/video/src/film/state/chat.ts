import type {PlanArtifactState, ToolActivityBlockState} from '../../agentbuddy-ui/threads/threadTypes';
import type {ChatComposerState} from '../../agentbuddy-ui/chat/chatTypes';
import {ease, textReveal} from './timeline';

export const launchComposerState: ChatComposerState = {
  placeholder: 'Message Agent',
  mode: 'Codex',
  phase: 'Plan',
  bottomTabs: {
    activeLabel: 'AgentBuddy launch film',
    newThreadLabel: 'New thread',
    recentLabel: 'Recent Threads',
  },
};

export const launchComposerWithAttachmentState: ChatComposerState = {
  ...launchComposerState,
  attachments: [{type: 'image', label: 'image 1'}],
};

export const messageBubbleDemoState = {
  createdAt: '9:41 AM',
  system: 'Launch AgentBuddy',
  user: 'Turn this launch brief into tickets, notes, and a shippable PR plan.',
  queuedUser: 'Queue the release checklist after this plan is approved.',
  cancelledUser: 'Draft the old tutorial carousel again.',
  assistant: 'I found the launch context and turned it into an execution plan.',
};

export const chatShotState = {
  breadcrumbs: ['Threads', 'Launch Thread'],
  createdAt: '9:41 AM',
  cursorPath: {from: [48, 30] as [number, number], to: [78, 36] as [number, number], start: 80, end: 190},
  systemMessage: 'Launch AgentBuddy',
  prompt: {text: 'Turn this launch brief into tickets, notes, and a shippable PR plan.', from: 24, to: 88, caretUntil: 90},
  response: {text: 'I found the launch context and turned it into an execution plan.', from: 186, to: 248},
};

export const chatToolActivity: ToolActivityBlockState = {
  artifactRef: {
    artifactId: 'launch-operating-plan',
    label: 'Launch Operating Plan',
  },
  defaultOpen: true,
  entries: [
    {id: 'read-launch-notes', tool: 'Read', summary: 'notes/agentbuddy/tasklist/current.md', status: 'ok', durationMs: 312, outputSummary: 'Launch notes loaded'},
    {id: 'create-tickets', tool: 'Task', summary: 'create execution tickets from launch context', status: 'ok', durationMs: 1280, outputSummary: '4 tickets created'},
    {id: 'write-plan', tool: 'Write', summary: 'packages/video/src/film/state/launch-plan.ts', status: 'running'},
    {id: 'compile-flows', tool: 'Bash', summary: 'npm run compile:flows', status: 'running', durationMs: 5200},
  ],
  phase: launchComposerState.phase,
  state: 'streaming',
};

export const launchPlanArtifact: PlanArtifactState = {
  id: 'launch-operating-plan',
  title: 'Launch Operating Plan',
  content: {
    status: 'in-progress',
    notes: '- Capture launch context\n- Create execution tickets\n- Generate branch and PR plan\n- Automate release checks',
    steps: [
      {id: 'capture-context', title: 'Capture launch context', status: 'done'},
      {id: 'execution-tickets', title: 'Create execution tickets', status: 'done'},
      {id: 'branch-plan', title: 'Generate branch and PR plan', status: 'running'},
      {id: 'release-checks', title: 'Automate release checks', status: 'queued'},
    ],
  },
};

export function toolActivityViewForFrame(frame: number) {
  return {
    rowOpacities: chatToolActivity.entries.map((_, index) => ease(frame, 78 + index * 18, 96 + index * 18)),
    state: frame > 230 ? {...chatToolActivity, state: 'done' as const} : chatToolActivity,
  };
}

export function chatViewForFrame(frame: number) {
  return {
    prompt: textReveal(chatShotState.prompt.text, frame, chatShotState.prompt.from, chatShotState.prompt.to),
    promptCaretVisible: frame < chatShotState.prompt.caretUntil,
    response: textReveal(chatShotState.response.text, frame, chatShotState.response.from, chatShotState.response.to),
    toolActivity: toolActivityViewForFrame(frame),
  };
}
