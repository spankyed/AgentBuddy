import type {PromptSurfaceState} from '../../agentbuddy-ui/prompts/promptTypes';

export const promptsSurfaceState: PromptSurfaceState = {
  activePromptId: 'launch-planner',
  prompts: [
    {id: 'launch-planner', title: 'Launch planner', model: 'GPT-5', updatedAt: 'now'},
    {id: 'code-review', title: 'Code review summary', model: 'GPT-5', updatedAt: '22m ago'},
    {id: 'support-reply', title: 'Support reply', model: 'GPT-4.1 mini', updatedAt: '2h ago'},
  ],
  draft: [
    '# Launch planner',
    '',
    'Use the linked notes, current branch, open tasks, and release workflow outputs.',
    '',
    'Return:',
    '- launch positioning',
    '- execution checklist',
    '- PR summary',
    '- distribution plan',
  ].join('\n'),
  variables: [
    {key: 'workspace', value: 'AgentBuddy'},
    {key: 'branch', value: 'as/react-launch-film'},
    {key: 'target', value: 'launch'},
  ],
  testOutput: [
    'Positioning: AgentBuddy turns conversation into connected execution.',
    'Next step: create PR, publish branch, then schedule launch workflow.',
  ],
};
