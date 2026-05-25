import type {SettingsSurfaceState} from '../../agentbuddy-ui/settings/settingsTypes';

export const settingsSurfaceState: SettingsSurfaceState = {
  activeTab: 'general',
  generalNavItem: 'application',
  importStatus: 'idle',
  hotkeys: [
    {action: 'Execute query', shortcut: 'Cmd + Enter'},
    {action: 'Send message', shortcut: 'Cmd + Return'},
    {action: 'Open command palette', shortcut: 'Cmd + K'},
  ],
  personal: {
    name: 'Spanky Edwards',
    phoneNumber: '(555) 013-4412',
    address: {
      street: '120 Market Street',
      street2: 'Suite 400',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
    },
  },
  providers: {
    cli: [
      {label: 'Codex', command: 'codex', detected: true},
      {label: 'Claude Code', command: 'claude', detected: true},
    ],
    standard: [
      {key: 'anthropic', label: 'Anthropic', description: 'Claude 3, Claude 2', priority: 'required', saved: true},
      {key: 'openai', label: 'OpenAI', description: 'GPT-4, GPT-3.5, DALL-E', priority: 'required', saved: true},
      {key: 'google', label: 'Google AI', description: 'Gemini, PaLM', priority: 'recommended'},
      {key: 'groq', label: 'Groq', description: 'Fast inference API'},
      {key: 'mistral', label: 'Mistral AI', description: 'Mistral models'},
      {key: 'cohere', label: 'Cohere', description: 'Command, Embed, Rerank'},
    ],
    custom: [
      {name: 'OpenRouter', saved: true},
    ],
  },
  projects: [
    {name: 'AgentBuddy', directories: ['/Users/spankyed/Develop/Projects/AgentBuddy'], color: '#3b82f6'},
    {name: 'Clientlabs', directories: ['/Users/spankyed/Develop/Projects/Clientlabs', '/Users/spankyed/Develop/Projects/Clientlabs/site'], color: '#22c55e'},
  ],
  settingsJson: '{\n  "general": {\n    "application": {\n      "hotkeys": {\n        "sendMessage": "Cmd+Return",\n        "openCommandPalette": "Cmd+K"\n      }\n    },\n    "projects": [\n      {"name": "AgentBuddy", "color": "#3b82f6"}\n    ]\n  },\n  "plugins": {\n    "_meta": {"visibility": {"library": false}}\n  }\n}',
  pluginRows: [
    {id: 'threads', label: 'Threads', visible: true, settings: [{label: 'Default view', value: 'Board'}, {label: 'Archive completed threads', value: true}]},
    {id: 'notes', label: 'Notes', visible: true, settings: [{label: 'Show right rail', value: true}, {label: 'Default notebook', value: 'Tasklist'}]},
    {id: 'code', label: 'Code', visible: true, selected: true, settings: [{label: 'Default branch', value: 'as/react-launch-film'}, {label: 'Auto-stage generated files', value: false}]},
    {id: 'database', label: 'Database', visible: true, settings: [{label: 'Default schema', value: 'public'}, {label: 'Query timeout', value: '30s'}]},
    {id: 'logs', label: 'Logs', visible: true, settings: [{label: 'Capture app events', value: true}, {label: 'Level', value: 'Info'}]},
    {id: 'settings', label: 'Settings', visible: true, settings: [{label: 'Settings must remain visible', value: true}]},
  ],
  saveStatus: 'saved',
};

export function settingsSurfaceStateForFrame(frame: number): SettingsSurfaceState {
  if (frame < 48) return settingsSurfaceState;
  if (frame < 84) {
    return {
      ...settingsSurfaceState,
      generalNavItem: 'secrets',
    };
  }
  if (frame < 120) {
    return {
      ...settingsSurfaceState,
      generalNavItem: 'projects',
    };
  }
  if (frame < 156) {
    return {
      ...settingsSurfaceState,
      generalNavItem: 'personal',
    };
  }
  if (frame < 192) {
    return {
      ...settingsSurfaceState,
      activeTab: 'plugins',
    };
  }
  return {
    ...settingsSurfaceState,
    activeTab: 'help',
  };
}
