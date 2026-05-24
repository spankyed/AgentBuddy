import type {PlanArtifactState, ToolActivityItemState} from '../../agentbuddy-ui/threads/threadTypes';

export const chatShotState = {
  breadcrumbs: ['Threads', 'Launch Thread'],
  artifactLinkLabel: 'Launch Operating Plan',
  systemMessage: 'Launch AgentBuddy',
  prompt: 'Turn this launch brief into tickets, notes, and a shippable PR plan.',
  response: 'I found the launch context and turned it into an execution plan.',
};

export const chatToolActivity: ToolActivityItemState[] = [
  {tool: 'Read', summary: 'notes/agentbuddy/tasklist/current.md', status: 'ok', durationMs: 312, outputSummary: 'Launch notes loaded'},
  {tool: 'Task', summary: 'create execution tickets from launch context', status: 'ok', durationMs: 1280, outputSummary: '4 tickets created'},
  {tool: 'Write', summary: 'packages/video/src/film/state/launch-plan.ts', status: 'running'},
  {tool: 'Bash', summary: 'npm run compile:flows', status: 'running', durationMs: 5200},
];

export const launchPlanArtifact: PlanArtifactState = {
  title: 'Launch Operating Plan',
  status: 'in-progress',
  notes: '- Capture launch context\n- Create execution tickets\n- Generate branch and PR plan\n- Automate release checks',
};
