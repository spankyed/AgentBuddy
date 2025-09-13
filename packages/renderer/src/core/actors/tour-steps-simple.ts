export interface TourStep {
  id: string;
  targetId: string;
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
    content: 'Let\'s explore AgentBuddy\'s interface. We\'ll start with the toolbar where you select and manage plugins.',
    setupActions: [],
  },
  {
    id: 'toolbar',
    targetId: 'toolbar',
    title: 'Plugin Toolbar',
    content: 'Each icon in the plugin toolbar represents a different plugin you can use. Click on any icon to switch between plugins.',
    tooltipPosition: 'right',
    setupActions: [],
  },
  {
    id: 'canvas',
    targetId: 'canvas-area',
    title: 'Canvas Area',
    content: 'The canvas is the main workspace for plugins to display their content – and the assistant. It adapts based on the active plugin.',
    setupActions: [],
  },
  {
    id: 'chat',
    targetId: 'chat-area',
    title: 'Chat Area',
    content: 'This is where you interact with the AI assistant. Type in messages, send commands, and receive responses here.',
    setupActions: [],
  },
  {
    id: 'inspection',
    targetId: 'inspection-panel',
    title: 'Inspection Panel',
    content: 'The inspection panel shows contextual information like event traces from the brain. Plugins may also display some additional details or data in the inspection panel.',
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
    content: 'The Threads plugin helps you manage your chat threads.',
    tooltipPosition: 'right',
    setupActions: [],
  },
  {
    id: 'threads-intro',
    targetId: 'canvas-area',
    title: 'Thread Management',
    content: 'See your past conversations and threads. Organize threads hierarchically for advanced thread management.',
    setupActions: [
      selectPlugin('threads'),
        { target: 'threads', event: { type: 'VIEW_LIST' } },
    ],
  },

  // ========================================
  // Agent Plugin
  // ========================================
  {
    id: 'agent-plugin-icon',
    targetId: 'plugin-agent',
    title: 'Agent Plugin',
    content: 'The Agent plugin is your main AI assistant interface.',
    tooltipPosition: 'right',
    setupActions: [
      selectPlugin('agent'),
    ],
  },
  {
    id: 'agent-intro',
    targetId: 'canvas-area',
    title: 'Assistant Canvas',
    content: 'The assistant canvas is a place for your assistant to display longer text or image artifacts, without cluttering the main chat area below. With tabs, users can quickly switch between and show artifacts from different threads.',
    setupActions: [
      selectPlugin('agent'),
    ],
  },

  // ========================================
  // Library Plugin
  // ========================================
  {
    id: 'library-plugin-icon',
    targetId: 'plugin-library',
    title: 'Library Plugin',
    content: 'The Library plugin provides folder-based knowledge storage and document management.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('library')],
  },
  {
    id: 'library-overview',
    targetId: 'canvas-area',
    title: 'Knowledge Library',
    content: 'Store and organize documents to create a knowledge base for the assistant. Group related documents together using folders.',
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
    content: 'The Actions plugin allows you to create reusable templates for workflow steps.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('actions')],
  },
  {
    id: 'actions-overview',
    targetId: 'canvas-area',
    title: 'Action Templates',
    content: 'Actions are custom building blocks you can use in workflows. Each action accepts parameters and has access to services allowing the assistant to automate various tasks.',
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
    content: 'The Prompts plugin can be used to manage and keep track of your LLM prompt templates.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('prompts')],
  },
  {
    id: 'prompts-overview',
    targetId: 'canvas-area',
    title: 'Prompt Templates',
    content: 'Create and manage your prompt templates. Tip: Combine prompts using `usePrompt(\'label\')`',
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
    content: 'The Flows plugin creates visual workflows with a node-based editor.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('flows')],
  },
  {
    id: 'flows-overview',
    targetId: 'canvas-area',
    title: 'Visual Workflow Editor',
    content: 'Design and manage workflows using a visual node-based editor. With support for hierarchical sub-flows, you can create complex processes easily.',
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
    content: 'The Brain plugin allows you to monitor workflows as they execute.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('brain')],
  },
  {
    id: 'brain-overview',
    targetId: 'canvas-area',
    title: 'Execution Monitor',
    content: 'See a real-time execution graph of your flows. Select a node to view details and debug issues.',
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
    content: 'The Settings plugin allows you to configure AgentBuddy to your preferences.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('settings')],
  },
  {
    id: 'tour-complete',
    targetId: 'canvas-area',
    title: 'Final Step: Configure API Keys',
    content: 'To finish setting up AgentBuddy, you will need to set some API keys, preferably from multiple AI providers. Your keys are stored securely and never shared.',
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