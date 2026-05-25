import type {SettingsSurfaceState} from '../../agentbuddy-ui/settings/settingsTypes';

const baseSettings: Omit<SettingsSurfaceState, 'activeTab' | 'generalNavItem'> = {
  faqs: [
    {answer: 'AgentBuddy stores local configuration on this device and uses it to drive workflows, plugin state, and launch-film demos.', expanded: true, id: 'faq-local', question: 'Where are settings stored?'},
    {answer: 'Providers can be configured from the General > Providers view. Keys are masked once saved.', id: 'faq-providers', question: 'How do provider keys work?'},
    {answer: 'Setup packs import compiled actions, prompts, flows, library docs, and notes.', id: 'faq-setup', question: 'What is a setup pack?'},
  ],
  plugins: [
    {id: 'threads', label: 'Threads', visible: true},
    {id: 'notes', label: 'Notes', visible: true},
    {id: 'code', label: 'Code', visible: true},
    {id: 'flows', label: 'Flows', visible: true},
    {id: 'actions', label: 'Actions', visible: false},
    {id: 'prompts', label: 'Prompts', visible: false},
    {id: 'brain', label: 'Brain', visible: true},
    {id: 'database', label: 'Database', visible: true},
    {id: 'logs', label: 'Logs', visible: true},
    {id: 'settings', label: 'Settings', visible: true},
  ],
  customProviders: [
    {hasKey: true, id: 'clientlabs-api', name: 'Clientlabs API'},
  ],
  providers: [
    {description: 'Claude 3, Claude 2', hasKey: true, key: 'anthropic', label: 'Anthropic', placeholder: 'Enter Anthropic API key', priority: 'required'},
    {description: 'GPT-4, GPT-3.5, DALL-E', hasKey: true, key: 'openai', label: 'OpenAI', placeholder: 'Enter OpenAI API key', priority: 'required'},
    {description: 'Gemini, PaLM', hasKey: false, key: 'google', label: 'Google AI', placeholder: 'Enter Google AI API key', priority: 'recommended'},
    {description: 'Fast inference API', hasKey: false, key: 'groq', label: 'Groq', placeholder: 'Enter Groq API key'},
    {description: 'Mistral models', hasKey: false, key: 'mistral', label: 'Mistral AI', placeholder: 'Enter Mistral AI API key'},
    {description: 'Command, Embed, Rerank', hasKey: false, key: 'cohere', label: 'Cohere', placeholder: 'Enter Cohere API key'},
  ],
  projects: [
    {color: '#3b82f6', directories: ['/Users/spankyed/Develop/Projects/AgentBuddy'], name: 'AgentBuddy'},
    {color: '#22c55e', directories: ['/Users/spankyed/Develop/Projects/Clientlabs'], name: 'Clientlabs'},
    {color: '#f59e0b', directories: ['/Users/spankyed/Develop/Projects/Launch'], name: 'Launch'},
  ],
  saveStatus: 'saved',
  selectedPluginId: 'brain',
  selectedPluginSettings: {
    database: {
      executeQueryShortcut: '⌘ ↵',
    },
    logs: {
      excludedSources: ['app-events', 'debug.*'],
      maxLogs: 1000,
    },
  },
  settingsJson: JSON.stringify({
    general: {
      application: {hotkeys: {switchPluginDown: 'Cmd+Down', switchPluginUp: 'Cmd+Up'}},
      personal: {name: 'Spanky', phoneNumber: '(555) 120-4420'},
    },
    plugins: {_meta: {visibility: {actions: false, prompts: false}}},
  }, null, 2),
  user: {
    address: {
      city: 'Brooklyn',
      country: 'US',
      postalCode: '11211',
      state: 'NY',
      street: '120 Kent Ave',
      street2: 'Suite 4',
    },
    name: 'Spanky',
    phoneNumber: '(555) 120-4420',
  },
};

export const settingsApplicationState: SettingsSurfaceState = {
  ...baseSettings,
  activeTab: 'general',
  generalNavItem: 'application',
};

export const settingsProvidersState: SettingsSurfaceState = {
  ...baseSettings,
  activeTab: 'general',
  generalNavItem: 'secrets',
};

export const settingsProjectsState: SettingsSurfaceState = {
  ...baseSettings,
  activeTab: 'general',
  generalNavItem: 'projects',
};

export const settingsPersonalState: SettingsSurfaceState = {
  ...baseSettings,
  activeTab: 'general',
  generalNavItem: 'personal',
};

export const settingsJsonState: SettingsSurfaceState = {
  ...baseSettings,
  activeTab: 'general',
  generalNavItem: 'json',
};

export const settingsPluginsState: SettingsSurfaceState = {
  ...baseSettings,
  activeTab: 'plugins',
  generalNavItem: 'application',
};

export const settingsDatabasePluginState: SettingsSurfaceState = {
  ...settingsPluginsState,
  selectedPluginId: 'database',
};

export const settingsLogsPluginState: SettingsSurfaceState = {
  ...settingsPluginsState,
  selectedPluginId: 'logs',
};

export const settingsHelpState: SettingsSurfaceState = {
  ...baseSettings,
  activeTab: 'help',
  generalNavItem: 'application',
};
