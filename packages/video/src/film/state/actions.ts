import type {ActionsSurfaceState} from '../../agentbuddy-ui/actions/actionTypes';

export const actionsSurfaceState: ActionsSurfaceState = {
  view: 'list',
  categories: [
    {name: 'database', color: '#60a5fa'},
    {name: 'communication', color: '#4ade80'},
    {name: 'integration', color: '#facc15'},
    {name: 'utility', color: '#c084fc'},
  ],
  actions: [
    {
      id: 'action-release-checklist',
      label: 'Generate release checklist',
      description: 'Collect linked notes and source context into launch tasks.',
      category: 'utility',
      inputs: ['threadId', 'branch', 'targets'],
      inputParameters: {
        threadId: {type: 'string', required: true, description: 'Launch thread identifier'},
        branch: {type: 'string', required: true, description: 'Git branch to inspect'},
        targets: {type: 'array', description: 'Publishing targets'},
      },
      actionFn: "const { threadId, branch, targets } = params;\n\nawait services.logger.info('Generating release checklist', { threadId, branch });\n\nconst notes = await services.database.query(\n  'select title, body from notes where thread_id = ?',\n  [threadId]\n);\n\nconst checklist = await services.llm.generate({\n  prompt: 'Create a launch checklist from these notes and git branch.',\n  input: { branch, notes: notes.rows, targets }\n});\n\nreturn {\n  success: true,\n  checklist\n};",
      outputSchema: '{\n  "success": "boolean",\n  "checklist": ["string"]\n}',
      createdAt: 'May 21, 2026',
      updatedAt: 'May 24, 2026',
    },
    {
      id: 'action-query-launch',
      label: 'Query launch events',
      description: 'Read launch workflow events from the database.',
      category: 'database',
      inputs: ['project', 'status'],
      inputParameters: {
        project: {type: 'string', required: true, description: 'Project slug'},
        status: {type: 'string', description: 'Event status filter'},
      },
      actionFn: "return services.database.query('select * from launch_events where project = ?', [params.project]);",
      createdAt: 'May 20, 2026',
      updatedAt: 'May 24, 2026',
    },
    {
      id: 'action-publish-summary',
      label: 'Publish branch summary',
      description: 'Send the generated PR summary to the launch thread.',
      category: 'communication',
      inputs: ['prNumber'],
      inputParameters: {
        prNumber: {type: 'number', required: true, description: 'Pull request number'},
      },
      actionFn: "await services.github.commentOnPullRequest(params.prNumber, params.summary);\nreturn { posted: true };",
      createdAt: 'May 19, 2026',
      updatedAt: 'May 22, 2026',
    },
  ],
};

export const actionDetailState: ActionsSurfaceState = {
  ...actionsSurfaceState,
  view: 'detail',
  selectedActionId: 'action-release-checklist',
};
