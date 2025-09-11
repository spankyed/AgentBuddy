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
    content: 'This is the plugin toolbar. Each icon represents a different plugin you can use. Click on any icon to switch between plugins.',
    tooltipPosition: 'right',
    setupActions: [],
  },
  {
    id: 'canvas',
    targetId: 'canvas-area',
    title: 'Canvas Area',
    content: 'The canvas is the main workspace where most plugins display their content. It adapts based on the active plugin.',
    setupActions: [],
  },
  {
    id: 'chat',
    targetId: 'chat-area',
    title: 'Chat Area',
    content: 'This is where you interact with the AI assistant. Type messages, send commands, and receive responses here.',
    setupActions: [],
  },
  {
    id: 'inspection',
    targetId: 'inspection-panel',
    title: 'Inspection Panel',
    content: 'The inspection panel shows contextual information like event traces from the brain. It may also display additional details or data from plugins.',
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
    content: 'The Threads plugin manages your conversations and chat history.',
    tooltipPosition: 'right',
    setupActions: [],
  },
  {
    id: 'threads-intro',
    targetId: 'canvas-area',
    title: 'Thread Management',
    content: 'The Threads plugin shows your past conversations and lets you organize them into hierarchical threads for easier management.',
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
    title: 'AI Assistant Interface',
    content: 'This is where you interact with the AI assistant. You can have multiple conversation tabs, view artifacts, and chat with the AI.',
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
    content: 'Store and organize your documents, notes, and knowledge bases. Create collections to group related content together.',
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
    content: 'The Actions plugin manages reusable templates for workflow steps.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('actions')],
  },
  {
    id: 'actions-overview',
    targetId: 'canvas-area',
    title: 'Action Templates',
    content: 'Actions serve as building blocks for workflows. Each action defines a specific task with parameters and implementation.',
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
    content: 'The Prompts plugin allows you to manage your reusable LLM prompt templates.',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('prompts')],
  },
  {
    id: 'prompts-overview',
    targetId: 'canvas-area',
    title: 'Prompt Templates',
    content: 'Create and manage prompt templates with variables that can be reused across different contexts.',
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
    content: 'Design and manage workflows using a visual node-based editor. Connect actions, decisions, and AI steps together.',
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
    content: 'See a real-time execution graph of your flows. Watch events flow through your system and debug issues.',
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
    id: 'settings-overview',
    targetId: 'canvas-area',
    title: 'Settings Overview',
    content: 'The Settings plugin is organized into tabs. General settings for core configuration, Plugins tab for individual plugin settings, and Help for documentation and support.',
    setupActions: [
      selectPlugin('settings'),
      { target: 'settings', event: { type: 'TAB.SELECT', tab: 'general' } },
    ],
  },

  // ========================================
  // Tour Complete
  // ========================================
  {
    id: 'tour-complete',
    targetId: '', // No target for centered modal
    title: 'Tour Complete!',
    content: 'Congratulations! You\'ve completed the guided tour. All plugins are now visible and you\'re ready to start using AgentBuddy. Explore, customize, and build amazing workflows!',
    setupActions: [],
  },
];