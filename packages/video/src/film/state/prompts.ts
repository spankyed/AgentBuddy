import type {PromptsSurfaceState} from '../../agentbuddy-ui/prompts/promptTypes';

export const promptsSurfaceState: PromptsSurfaceState = {
  view: 'list',
  selectedCategories: [],
  categories: [
    {name: 'development', color: '#4ade80'},
    {name: 'assistant', color: '#c084fc'},
    {name: 'analysis', color: '#fb923c'},
    {name: 'formatting', color: '#22d3ee'},
  ],
  prompts: [
    {
      id: 'prompt-release-summary',
      label: 'Release summary',
      description: 'Generate a concise launch summary from branch changes and linked notes.',
      category: 'development',
      inputs: {
        branch: {name: 'branch', type: 'string', required: true, description: 'Current git branch'},
        changes: {name: 'changes', type: 'array', required: true, description: 'Changed files and commit context'},
        audience: {name: 'audience', type: 'string', description: 'Target reader'},
      },
      templateFn: "const {branch, changes, audience} = params;\n\nreturn `Summarize ${branch} for ${audience}.\n\nInclude:\n${changes.map(change => `- ${change}`).join('\\n')}\n\nKeep it direct and launch-ready.`;",
      outputSchema: '{\n  "summary": "string",\n  "risks": ["string"],\n  "nextSteps": ["string"]\n}',
      createdAt: 'May 22, 2026',
      updatedAt: 'May 24, 2026',
    },
    {
      id: 'prompt-ticket-plan',
      label: 'Ticket plan',
      description: 'Turn a launch thread into scoped implementation tickets.',
      category: 'assistant',
      inputs: {
        thread: {name: 'thread', type: 'string', required: true, description: 'Source launch thread'},
        constraints: {name: 'constraints', type: 'array', description: 'Known product constraints'},
      },
      templateFn: "return `Create tickets from this thread:\\n\\n${params.thread}`;",
      createdAt: 'May 18, 2026',
      updatedAt: 'May 23, 2026',
    },
    {
      id: 'prompt-log-analysis',
      label: 'Log analysis',
      description: 'Extract root causes and user-visible impact from log events.',
      category: 'analysis',
      inputs: {
        events: {name: 'events', type: 'array', required: true, description: 'Log event records'},
      },
      templateFn: "return `Analyze these events:\\n${JSON.stringify(params.events, null, 2)}`;",
      createdAt: 'May 15, 2026',
      updatedAt: 'May 21, 2026',
    },
  ],
};

export const promptDetailState: PromptsSurfaceState = {
  ...promptsSurfaceState,
  view: 'detail',
  selectedPromptId: 'prompt-release-summary',
};
