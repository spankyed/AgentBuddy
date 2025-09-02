import type { TourStep } from './guided-tour';

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
  {
    id: 'threads-create',
    targetId: 'thread-create-button',
    title: 'Creating Threads',
    content: 'Click this button to create a new thread.',
    setupActions: [
      selectPlugin('threads'),
      { target: 'threads', event: { type: 'VIEW_LIST' } },
    ],
  },
  {
    id: 'threads-create-topic',
    targetId: 'thread-topic-input',
    title: 'Thread Topic',
    content: 'Enter a descriptive topic for your thread. This helps you quickly identify what the thread is about.',
    setupActions: [
      selectPlugin('threads'),
      { target: 'threads', event: { type: 'SHOW_CREATE_FORM' } },
    ],
  },
  {
    id: 'threads-create-instructions',
    targetId: 'thread-instructions-input',
    title: 'Thread Instructions',
    content: 'Provide detailed instructions for the AI agent. These guide the agent\'s behavior within this thread.',
    setupActions: [
      selectPlugin('threads'),
      { target: 'threads', event: { type: 'SHOW_CREATE_FORM' } },
    ],
  },
  {
    id: 'threads-create-tags',
    targetId: 'thread-tags-section',
    title: 'Thread Tags',
    content: 'Add tags to categorize and organize your threads. Click to expand this section and add tags.',
    setupActions: [
      selectPlugin('threads'),
      { target: 'threads', event: { type: 'SHOW_CREATE_FORM' } },
      { target: 'threads', event: { type: 'TOGGLE_TAGS_SECTION', show: true } },
    ],
  },
  {
    id: 'threads-create-linked',
    targetId: 'thread-linked-section',
    title: 'Linked Threads',
    content: 'Link related threads together for better context. Click to expand and link other threads.',
    setupActions: [
      selectPlugin('threads'),
      { target: 'threads', event: { type: 'SHOW_CREATE_FORM' } },
      { target: 'threads', event: { type: 'TOGGLE_LINKED_SECTION', show: true } },
    ],
  },
  {
    id: 'threads-create-cancel',
    targetId: 'thread-cancel-button',
    title: 'Cancel Creation',
    content: 'We\'ll cancel for now and return to the threads list. You can create threads anytime you need them.',
    setupActions: [
      selectPlugin('threads'),
      { target: 'threads', event: { type: 'SHOW_CREATE_FORM' } },
    ],
  },
  {
    id: 'threads-status',
    targetId: 'thread-status',
    title: 'Thread Status',
    content: 'Each thread has a status (Backlog, Open, In Progress, etc.). Statuses can be used to track progress and prioritize work for the AI. You can customize these in settings.',
    setupActions: [
      selectPlugin('threads'),
      { target: 'threads', event: { type: 'CANCEL_CREATE' } },
    ],
  },
  {
    id: 'threads-actions',
    targetId: 'thread-actions',
    title: 'Thread Actions',
    content: 'Use these actions to delete threads or open them in the chat.',
    setupActions: [
      selectPlugin('threads'),
      { target: 'threads', event: { type: 'CANCEL_CREATE' } },
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
    content: 'This is where you interact with the AI assistant. Let\'s explore its features.',
    setupActions: [
      selectPlugin('agent'),
    ],
  },
  {
    id: 'agent-tabs',
    targetId: 'agent-thread-tabs',
    title: 'Thread Tabs',
    content: 'Each tab represents an open thread. Switch between conversations by clicking different tabs.',
    setupActions: [
      selectPlugin('agent'),
    ],
  },
  {
    id: 'agent-artifacts',
    targetId: 'agent-artifacts',
    title: 'Artifacts',
    content: 'Artifacts are structured outputs separate from chat messages. They include todo lists, code files, diagrams, and more.',
    setupActions: [
      selectPlugin('agent'),
    ],
  },
  {
    id: 'agent-chat',
    targetId: 'agent-chat-input',
    title: 'Chat Interface',
    content: 'Type your messages here to interact with the AI. The assistant can help with planning, coding, debugging, and more.',
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
  {
    id: 'library-create-document',
    targetId: 'library-create-button',
    title: 'Create Document',
    content: 'Click here to create a new document. Documents can contain various content types and be organized with tags.',
    setupActions: [
      selectPlugin('library'),
      { target: 'library', event: { type: 'VIEW_BROWSER' } },
    ],
  },
  {
    id: 'library-document-name',
    targetId: 'library-document-name-input',
    title: 'Document Name',
    content: 'Give your document a descriptive name. This helps you find it quickly later.',
    setupActions: [
      selectPlugin('library'),
      { target: 'library', event: { type: 'CREATE_DOCUMENT' } },
    ],
  },
  {
    id: 'library-content-sections',
    targetId: 'library-content-sections',
    title: 'Content Sections',
    content: 'Documents support different section types: text blocks for prose, lists for structured data, and fields for key-value pairs.',
    setupActions: [
      selectPlugin('library'),
      { target: 'library', event: { type: 'CREATE_DOCUMENT' } },
    ],
  },
  {
    id: 'library-table-actions',
    targetId: 'library-table',
    title: 'Document & Folder Management',
    content: 'You can drag documents & folders to reorder them, multi-select to move as groups.',
    setupActions: [
      selectPlugin('library'),
      { target: 'library', event: { type: 'VIEW_BROWSER' } },
    ],
  },
  {
    id: 'library-search-index',
    targetId: 'library-search-index-button',
    title: 'Search Indexes',
    content: 'Create search indexes to enable fast, intelligent search across your documents and external sources.',
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
  {
    id: 'actions-create-button',
    targetId: 'actions-create-button',
    title: 'Create Action',
    content: 'Click here to create a new action.',
    setupActions: [
      selectPlugin('actions'),
      { target: 'actions', event: { type: 'VIEW_LIST' } },
    ],
  },
  {
    id: 'actions-label-input',
    targetId: 'action-label-input',
    title: 'Action Label',
    content: 'Give your action a clear, descriptive name.',
    setupActions: [
      selectPlugin('actions'),
      { target: 'actions', event: { type: 'ACTION.CREATE' } },
    ],
  },
  {
    id: 'actions-description',
    targetId: 'action-description-input',
    title: 'Action Description',
    content: 'Provide a detailed description of what this action accomplishes and when to use it.',
    setupActions: [
      selectPlugin('actions'),
      { target: 'actions', event: { type: 'ACTION.CREATE' } },
    ],
  },
  {
    id: 'actions-parameters',
    targetId: 'action-parameters-section',
    title: 'Action Parameters',
    content: 'Define input parameters that your action needs. Each parameter can have a type, default value, and validation rules.',
    setupActions: [
      selectPlugin('actions'),
      { target: 'actions', event: { type: 'ACTION.CREATE' } },
      { target: 'actions', event: { type: 'TOGGLE_PARAMETERS_SECTION', show: true } },
    ],
  },
  {
    id: 'actions-function-body',
    targetId: 'action-function-editor',
    title: 'Function Implementation',
    content: 'Write the JavaScript code that implements your action. You have access to various services like database, AI models, and external APIs.',
    setupActions: [
      selectPlugin('actions'),
      { target: 'actions', event: { type: 'ACTION.CREATE' } },
    ],
  },
  {
    id: 'actions-delete',
    targetId: 'action-delete-button',
    title: 'Delete Action',
    content: 'You can delete actions that are no longer needed. Be careful - this cannot be undone!',
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
  {
    id: 'prompts-create-button',
    targetId: 'prompts-create-button',
    title: 'Create Prompt',
    content: 'Click here to create a new prompt template.',
    setupActions: [
      selectPlugin('prompts'),
      { target: 'prompts', event: { type: 'VIEW_LIST' } },
    ],
  },
  {
    id: 'prompts-name-input',
    targetId: 'prompt-name-input',
    title: 'Prompt Name',
    content: 'Give your prompt template a descriptive name.',
    setupActions: [
      selectPlugin('prompts'),
      { target: 'prompts', event: { type: 'PROMPT.CREATE' } },
    ],
  },
  {
    id: 'prompts-inputs',
    targetId: 'prompt-inputs-add',
    title: 'Input Variables',
    content: 'Define variables that can be filled into the prompt.',
    setupActions: [
      selectPlugin('prompts'),
      { target: 'prompts', event: { type: 'PROMPT.CREATE' } },
      { target: 'prompts', event: { type: 'TOGGLE_INPUTS_SECTION', show: true } },
    ],
  },
  {
    id: 'prompts-template',
    targetId: 'prompt-template-editor',
    title: 'Prompt Template',
    content: 'Write your prompt template here using JavaScript\'s template literal syntax.',
    setupActions: [
      selectPlugin('prompts'),
      { target: 'prompts', event: { type: 'PROMPT.CREATE' } },
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
  {
    id: 'flows-root-flow',
    targetId: 'flow-root-item',
    title: 'Root Flow',
    content: 'This is the root flow - it always runs on startup. Other flows are blueprints that only run when called from here.',
    setupActions: [
      selectPlugin('flows'),
      { target: 'flows', event: { type: 'VIEW_LIST' } },
    ],
  },
  {
    id: 'flows-create-button',
    targetId: 'flow-create-button',
    title: 'Create New Flow',
    content: 'Click here to create new flow blueprints. These can be used as sub-flows within other flows.',
    setupActions: [
      selectPlugin('flows'),
      { target: 'flows', event: { type: 'VIEW_LIST' } },
    ],
  },
  {
    id: 'flows-editor-canvas',
    targetId: 'flow-editor-canvas',
    title: 'Flow Editor Canvas',
    content: 'This is the flow editor canvas. You can drag nodes from the palette and connect them to create workflows.',
    setupActions: [
      selectPlugin('flows'),
      { target: 'flows', event: { type: 'SELECT_ROOT_FLOW' } },
    ],
  },
  {
    id: 'flows-node-palette',
    targetId: 'flow-node-palette',
    title: 'Node Palette',
    content: 'Drag and drop nodes from here onto the canvas. Available nodes include actions, AI steps, decisions, and more.',
    setupActions: [
      selectPlugin('flows'),
      { target: 'flows', event: { type: 'SELECT_ROOT_FLOW' } },
    ],
  },
  {
    id: 'flows-connect-nodes',
    targetId: 'flow-editor-canvas',
    title: 'Connecting Nodes',
    content: 'Connect nodes by dragging from output ports to input ports. This defines the execution flow of your workflow.',
    setupActions: [
      selectPlugin('flows'),
      { target: 'flows', event: { type: 'SELECT_ROOT_FLOW' } },
    ],
  },
  {
    id: 'flows-node-form',
    targetId: 'flow-node-form',
    title: 'Node Configuration',
    content: 'Double-click any node to configure it. Set labels, parameters, and customize behavior for each step.',
    setupActions: [
      selectPlugin('flows'),
      { target: 'flows', event: { type: 'SELECT_ROOT_FLOW' } },
      { target: 'flows', event: { type: 'SELECT_AND_EDIT_FIRST_NODE' } },
    ],
  },
  {
    id: 'flows-node-label',
    targetId: 'flow-node-label-input',
    title: 'Node Label',
    content: 'Give each node a short descriptive label thats easy to remember as other nodes in your workflow may need to reference the step by it\'s label.',
    setupActions: [
      selectPlugin('flows'),
      { target: 'flows', event: { type: 'SELECT_ROOT_FLOW' } },
      { target: 'flows', event: { type: 'SELECT_AND_EDIT_FIRST_NODE' } },
    ],
  },

  // ========================================
  // Brain Plugin
  // ========================================
  {
    id: 'brain-plugin-icon',
    targetId: 'plugin-brain',
    title: 'Brain Plugin',
    content: 'The Brain plugin allows you to monitor workflows as they execute. ',
    tooltipPosition: 'right',
    setupActions: [...showAndSelectPlugin('brain')],
  },
  {
    id: 'brain-overview',
    targetId: 'brain-flow-graph',
    title: 'Execution Monitor',
    content: 'See a real-time execution graph of your flows. Watch events flow through your system and debug issues.',
    setupActions: [
      selectPlugin('brain'),
    ],
  },
  {
    id: 'brain-step-details',
    targetId: 'brain-step-details',
    title: 'Step Node Details',
    content: 'Click on any node to see its execution details, including input/output data and timing information.',
    setupActions: [
      selectPlugin('brain'),
      { target: 'brain', event: { type: 'SELECT_AND_SHOW_FIRST_NODE' } },
    ],
  },

  // ========================================
  // Settings Plugin
  // ========================================
  {
    id: 'settings-plugin-icon',
    targetId: 'plugin-settings',
    title: 'Settings Plugin',
    content: 'The Settings plugin allows you to further configure AgentBuddy to your preferences.',
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
  {
    id: 'settings-general',
    targetId: 'settings-general-tab',
    title: 'General Settings',
    content: 'Configure basic application settings like API keys and personal information.',
    setupActions: [
      selectPlugin('settings'),
      { target: 'settings', event: { type: 'TAB.SELECT', tab: 'general' } },
    ],
  },
  {
    id: 'settings-plugins-tab',
    targetId: 'settings-plugins-tab',
    title: 'Plugin Settings',
    content: 'Customize individual plugin behaviors and configurations.',
    setupActions: [
      selectPlugin('settings'),
      { target: 'settings', event: { type: 'TAB.SELECT', tab: 'plugins' } },
    ],
  },
  {
    id: 'settings-thread-tags',
    targetId: 'settings-thread-tags',
    title: 'Thread Tags',
    content: 'From the threads plugin settings, you can create and manage tags for organizing your threads. Add colors and descriptions to make them meaningful.',
    setupActions: [
      selectPlugin('settings'),
      { target: 'settings', event: { type: 'TAB.SELECT', tab: 'plugins' } },
      { target: 'settings', event: { type: 'PLUGIN.SELECT', pluginId: 'threads' } },
    ],
  },
  {
    id: 'settings-root-flow',
    targetId: 'settings-root-flow',
    title: 'Root Flow Selection',
    content: 'From the flows plugin settings, choose which flow runs on startup. This is typically your main workflow orchestrator.',
    setupActions: [
      selectPlugin('settings'),
      { target: 'settings', event: { type: 'TAB.SELECT', tab: 'plugins' } },
      { target: 'settings', event: { type: 'PLUGIN.SELECT', pluginId: 'flows' } },
    ],
  },
  {
    id: 'settings-kill-brain',
    targetId: 'settings-kill-brain-button',
    title: 'Stop Brain',
    content: 'Stop the Brain execution engine to halt all running workflows. You can restart it anytime to resume operations.',
    setupActions: [
      selectPlugin('settings'),
      { target: 'settings', event: { type: 'TAB.SELECT', tab: 'plugins' } },
      { target: 'settings', event: { type: 'PLUGIN.SELECT', pluginId: 'brain' } },
    ],
  },
  {
    id: 'settings-secrets-tab',
    targetId: 'settings-secrets-section',
    title: 'API Keys & Secrets',
    content: 'To use AI features, you\'ll need API keys from AI providers. Your keys are stored securely and never shared.',
    setupActions: [
      selectPlugin('settings'),
      { target: 'settings', event: { type: 'TAB.SELECT', tab: 'general' } },
      { target: 'settings', event: { type: 'GENERAL_NAV.SELECT', item: 'secrets' } },
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