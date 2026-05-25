import type {ActionsSurfaceState} from '../../agentbuddy-ui/actions/actionTypes';

export const actionsSurfaceState: ActionsSurfaceState = {
  activeActionId: 'release-checklist',
  actions: [
    {id: 'release-checklist', name: 'Generate release checklist', trigger: 'manual', updatedAt: '4m ago'},
    {id: 'publish-branch', name: 'Publish branch summary', trigger: 'source control', updatedAt: '18m ago'},
    {id: 'sync-launch-notes', name: 'Sync launch notes', trigger: 'notes', updatedAt: '1h ago'},
  ],
  actionCode: [
    'export default async function run(ctx) {',
    '  const notes = await ctx.notes.linked("launch");',
    '  const pr = await ctx.code.currentPullRequest();',
    '  const tasks = await ctx.threads.createCards(notes);',
    '',
    '  return ctx.workflows.schedule("release-checks", {',
    '    pr: pr.number,',
    '    tasks: tasks.map(task => task.id),',
    '  });',
    '}',
  ].join('\n'),
  environment: [
    {key: 'workspace', value: 'AgentBuddy'},
    {key: 'branch', value: 'as/react-launch-film'},
    {key: 'mode', value: 'Plan'},
  ],
  runs: [
    {id: 'run-1', status: 'success', summary: 'Created 4 cards', time: '10:42'},
    {id: 'run-2', status: 'running', summary: 'Scheduling checks', time: 'now'},
  ],
};
