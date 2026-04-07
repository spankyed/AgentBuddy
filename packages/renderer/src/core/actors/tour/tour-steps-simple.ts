export type TourTarget = string | { id: string; flash?: boolean };

export interface TourStep {
  id: string;
  targetId: string | TourTarget | TourTarget[];
  title: string;
  content: string;
  tooltipPosition?: 'auto' | 'left' | 'right' | 'top' | 'bottom';
  setupActions?: Array<{
    target: string;
    event: any;
  }>;
}

// Helper function to create a plugin selection action
const selectPlugin = (pluginId: string) => ({
  target: 'application',
  event: { type: 'SELECT_PLUGIN', pluginId }
});

// Helper function to create plugin visibility and selection actions
const showAndSelectPlugin = (pluginId: string) => [
  {
    target: 'settings',
    event: {
      type: 'SETTINGS.UPDATE',
      entityType: 'plugin',
      label: '_meta',
      path: ['visibility', pluginId],
      value: true
    }
  },
  selectPlugin(pluginId)
];

export const tourSteps: TourStep[] = [
  // ========================================
  // UI Overview
  // ========================================
  {
    id: 'welcome',
    targetId: '', // No target for welcome screen
    title: 'Welcome to the Guided Tour',
    content: 'Let\'s explore AgentBuddy\'s interface. We\'ll start with the toolbar where you can switch between plugins.',
    setupActions: [],
  },
  {
    id: 'toolbar',
    targetId: 'toolbar',
    title: 'Plugin Toolbar',
    content: 'Each icon in the toolbar represents a plugin or tool you and your assistant can use to get work done.',
    tooltipPosition: 'right',
    setupActions: [],
  },
  {
    id: 'canvas',
    targetId: 'canvas-area',
    title: 'Canvas Area',
    content: 'The canvas is the main content area for plugin tools. It is adapted based on the active plugin.',
    setupActions: [],
  },
  {
    id: 'chat',
    targetId: 'chat-area',
    title: 'Chat Area',
    content: 'No surprise, this is where you chat and view your conversation with the assistant. You can also send commands to the application using ::command.',
    setupActions: [],
  },
  {
    id: 'inspection',
    targetId: 'inspection-panel',
    title: 'Inspection Panel',
    content: 'The inspection panel is used to show supplemental information like event traces from the brain. Plugins may also choose to display plugin details in this panel.',
    tooltipPosition: 'left',
    setupActions: [
      { target: 'application', event: { type: 'SHOW_INSPECTION_PANEL' } },
    ],
  },
  
  // ========================================
  // Threads Plugin
  // ========================================
  {
    id: 'threads-plugin-icon',
    targetId: 'plugin-threads',
    title: 'Threads Plugin',
    content: 'A place to manage your conversations and threads.',
    tooltipPosition: 'right',
    setupActions: [],
  },
  {
    id: 'threads-intro',
    targetId: 'canvas-area',
    title: 'Thread Management',
    content: 'View and organize past conversations and threads hierarchically for better context management.',
    setupActions: [
      selectPlugin('threads'),
        { target: 'threads', event: { type: 'VIEW_LIST' } },
    ],
  },

  // ========================================
  // Chat & Artifacts
  // ========================================
  {
    id: 'agent-plugin-icon',
    targetId: 'plugin-threads',
    title: 'Chat & Artifacts',
    content: 'A place for the assistant to share information and collaborate.',
    tooltipPosition: 'right',
    setupActions: [
      selectPlugin('threads'),
    ],
  },
  {
    id: 'agent-intro',
    targetId: 'canvas-area',
    title: 'Agent Canvas',
    content: 'The assistant will display longer text or image artifacts here, to avoid cluttering the main chat area below. Quickly switch between different thread tabs to view artifacts from various threads.',
    setupActions: [
      selectPlugin('threads'),
    ],
  },

  // ========================================
  // Library Plugin
  // ========================================
  {
    id: 'library-plugin-icon',
    targetId: 'plugin-library',
    title: 'Library Plugin',
    content: 'A folder-based document store for knowledge management.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('library')],
  },
  {
    id: 'library-overview',
    targetId: 'canvas-area',
    title: 'Knowledge Library',
    content: 'Store information and organize documents into folders to create a knowledge base for the assistant. Create search indexes to enable semantic search and retrieval over your documents.',
    setupActions: [
      selectPlugin('library'),
      { target: 'library', event: { type: 'VIEW_BROWSER' } },
    ],
  },

  // ========================================
  // Actions Plugin
  // ========================================
  {
    id: 'actions-plugin-icon',
    targetId: 'plugin-actions',
    title: 'Actions Plugin',
    content: 'A tool to create custom-code for workflow steps.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('actions')],
  },
  {
    id: 'actions-overview',
    targetId: 'canvas-area',
    title: 'Action Templates',
    content: 'Actions are custom-code building blocks you can use in workflows. Each action accepts parameters and has access to services needed to automate various tasks.',
    setupActions: [
      selectPlugin('actions'),
      { target: 'actions', event: { type: 'VIEW_LIST' } },
    ],
  },

  // ========================================
  // Prompts Plugin
  // ========================================
  {
    id: 'prompts-plugin-icon',
    targetId: 'plugin-prompts',
    title: 'Prompts Plugin',
    content: 'A tool to manage and iterate on your LLM prompt templates.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('prompts')],
  },
  {
    id: 'prompts-overview',
    targetId: 'canvas-area',
    title: 'Prompt Templates',
    content: 'Create and manage LLM prompts. Tip: Combine prompts with `usePrompt(\'label\')`',
    setupActions: [
      selectPlugin('prompts'),
      { target: 'prompts', event: { type: 'VIEW_LIST' } },
    ],
  },

  // ========================================
  // Flows Plugin
  // ========================================
  {
    id: 'flows-plugin-icon',
    targetId: 'plugin-flows',
    title: 'Flows Plugin',
    content: 'A drag-and-drop step editor tool to build and orchestrate the behavior of your assistant.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('flows')],
  },
  {
    id: 'flows-overview',
    targetId: 'canvas-area',
    title: 'Visual Workflow Editor',
    content: 'Design and manage AI workflows with support for hierarchical and sub-flows. Create complex automations that are easy to reason about.',
    setupActions: [
      selectPlugin('flows'),
      { target: 'flows', event: { type: 'VIEW_LIST' } },
    ],
  },

  // ========================================
  // Brain Plugin
  // ========================================
  {
    id: 'brain-plugin-icon',
    targetId: 'plugin-brain',
    title: 'Brain Plugin',
    content: 'A tool for monitoring your AI or assistant workflows as they execute.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('brain')],
  },
  {
    id: 'brain-overview',
    targetId: 'canvas-area',
    title: 'Execution Monitor',
    content: 'See a real-time execution graph of your flows. Select a step node to view it\'s details and debug issues.',
    setupActions: [
      selectPlugin('brain'),
    ],
  },

  // ========================================
  // Settings Plugin
  // ========================================
  {
    id: 'settings-plugin-icon',
    targetId: 'plugin-settings',
    title: 'Settings Plugin',
    content: 'A place to customize and configure the application to your likings.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('settings')],
  },
  {
    id: 'tour-complete',
    targetId: [
      'canvas-area',
      { id: 'settings-openai-key-input', flash: true },
      { id: 'settings-anthropic-key-input', flash: true }
    ],
    title: 'Final Step: Configure API Keys',
    content: 'To finish getting setup, you will need to configure some API keys. You can click an AI provider\'s name to go to their settings page and copy over your keys. Keys are stored locally and are never shared.',
    setupActions: [
      selectPlugin('settings'),
      { target: 'settings', event: { type: 'TAB.SELECT', tab: 'general' } },
      { target: 'settings', event: { type: 'GENERAL_NAV.SELECT', item: 'secrets' } },
    ],
  },

  // ========================================
  // Tour Complete
  // ========================================
  // {
  //   id: 'tour-complete',
  //   targetId: '', // No target for centered modal
  //   title: 'Tour Complete!',
  //   content: 'Congratulations! You\'ve completed the guided tour. All plugins are now visible and you\'re ready to start using AgentBuddy. Explore, customize, and build amazing workflows!',
  //   setupActions: [],
  // },
];