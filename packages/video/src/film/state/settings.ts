import type {SettingsSurfaceState} from '../../agentbuddy-ui/settings/settingsTypes';

export const settingsSurfaceState: SettingsSurfaceState = {
  activeSection: 'models',
  sections: [
    {id: 'general', label: 'General'},
    {id: 'models', label: 'Models'},
    {id: 'tools', label: 'Tools'},
    {id: 'shortcuts', label: 'Shortcuts'},
    {id: 'account', label: 'Account'},
  ],
  preferences: [
    {label: 'Workspace', value: 'Clientlabs / AgentBuddy'},
    {label: 'Default thread mode', value: 'Codex / Plan'},
  ],
  modelRouting: [
    {task: 'Planning', provider: 'OpenAI', model: 'GPT-5', selected: true},
    {task: 'Code execution', provider: 'Anthropic', model: 'Claude Code'},
    {task: 'Fast summaries', provider: 'OpenAI', model: 'GPT-4.1 mini'},
  ],
  tools: [
    {name: 'Notes memory', scope: 'Read linked notes and tasklists', enabled: true},
    {name: 'Source control', scope: 'Create branches and pull requests', enabled: true},
    {name: 'Workflow actions', scope: 'Run release automation', enabled: true},
  ],
};
