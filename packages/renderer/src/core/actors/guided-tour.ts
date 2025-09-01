import { setup, assign, sendParent, fromCallback, emit, sendTo } from 'xstate';
import { trpc } from '@/core/trpc';

export interface TourStep {
  id: string;
  targetId: string;
  title: string;
  content: string;
  setupActions?: Array<{
    target: string; // 'application' or plugin ID (e.g., 'threads', 'agent')
    event: unknown; // The event to send to the target
  }>;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

interface Context {
  currentStepIndex: number;
  steps: TourStep[];
}

type Event =
  | { type: 'NEXT' }
  | { type: 'PREVIOUS' }
  | { type: 'END' }
  | { type: 'COMPLETE' }
  | { type: 'STEP_ACTION_COMPLETED' };

const tourSteps: TourStep[] = [
  // UI Overview
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
  
  // Threads Plugin
  {
    id: 'threads-intro',
    targetId: 'plugin-threads',
    title: 'Threads Plugin',
    content: 'Now let\'s explore the Threads plugin. It shows your past conversations and lets you organize them into hierarchical threads for easier management.',
    setupActions: [
      { target: 'application', event: { type: 'SELECT_PLUGIN', pluginId: 'threads' } },
      { target: 'threads', event: { type: 'VIEW_LIST' } },
    ],
  },
  {
    id: 'threads-create',
    targetId: 'thread-create-button',
    title: 'Creating Threads',
    content: 'Click this button to create a new thread. Let\'s explore the thread creation form.',
    setupActions: [
      { target: 'application', event: { type: 'SELECT_PLUGIN', pluginId: 'threads' } },
      { target: 'threads', event: { type: 'VIEW_LIST' } },
    ],
  },
  {
    id: 'threads-create-topic',
    targetId: 'thread-topic-input',
    title: 'Thread Topic',
    content: 'Enter a descriptive topic for your thread. This helps you quickly identify what the thread is about.',
    setupActions: [
      { target: 'application', event: { type: 'SELECT_PLUGIN', pluginId: 'threads' } },
      { target: 'threads', event: { type: 'SHOW_CREATE_FORM' } },
    ],
  },
  {
    id: 'threads-create-instructions',
    targetId: 'thread-instructions-input',
    title: 'Thread Instructions',
    content: 'Provide detailed instructions for the AI agent. These guide the agent\'s behavior within this thread.',
    setupActions: [
      { target: 'application', event: { type: 'SELECT_PLUGIN', pluginId: 'threads' } },
      { target: 'threads', event: { type: 'SHOW_CREATE_FORM' } },
    ],
  },
  {
    id: 'threads-create-tags',
    targetId: 'thread-tags-section',
    title: 'Thread Tags',
    content: 'Add tags to categorize and organize your threads. Click to expand this section and add tags.',
    setupActions: [
      { target: 'application', event: { type: 'SELECT_PLUGIN', pluginId: 'threads' } },
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
      { target: 'application', event: { type: 'SELECT_PLUGIN', pluginId: 'threads' } },
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
      { target: 'threads', event: { type: 'CANCEL_CREATE' } },
    ],
  },
  {
    id: 'threads-status',
    targetId: 'thread-status',
    title: 'Thread Status',
    content: 'Each thread has a status (Backlog, Open, In Progress, etc.). You can customize these in settings.',
    setupActions: [],
  },
  {
    id: 'threads-actions',
    targetId: 'thread-actions',
    title: 'Thread Actions',
    content: 'Use these actions to delete threads or open them in the chat. The chat button switches to the Agent plugin.',
    setupActions: [],
  },
  
  // Agent Plugin
  {
    id: 'agent-intro',
    targetId: 'plugin-agent',
    title: 'Agent Plugin',
    content: 'The Agent plugin is your main AI assistant interface. Let\'s explore its features.',
    setupActions: [
      { target: 'application', event: { type: 'SELECT_PLUGIN', pluginId: 'agent' } },
    ],
  },
  {
    id: 'agent-tabs',
    targetId: 'agent-thread-tabs',
    title: 'Thread Tabs',
    content: 'Each tab represents an open thread. Switch between conversations by clicking different tabs.',
    setupActions: [
      { target: 'application', event: { type: 'SELECT_PLUGIN', pluginId: 'agent' } },
    ],
  },
  {
    id: 'agent-artifacts',
    targetId: 'agent-artifacts',
    title: 'Artifacts',
    content: 'Artifacts are structured outputs separate from chat messages. They include todo lists, code files, diagrams, and more.',
    setupActions: [
      { target: 'application', event: { type: 'SELECT_PLUGIN', pluginId: 'agent' } },
    ],
  },
  {
    id: 'agent-chat',
    targetId: 'agent-chat-input',
    title: 'Chat Interface',
    content: 'Type your messages here to interact with the AI. The assistant can help with planning, coding, debugging, and more.',
    setupActions: [
      { target: 'application', event: { type: 'SELECT_PLUGIN', pluginId: 'agent' } },
    ],
  },
  {
    id: 'tour-complete',
    targetId: 'toolbar',
    title: 'Tour Complete!',
    content: 'You\'ve completed the guided tour! All plugins are now visible. Explore and customize AgentBuddy to fit your workflow.',
    setupActions: [],
  },
];

export const guidedTourMachine = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
  },
  actions: {
    incrementStep: assign({
      currentStepIndex: ({ context }) => Math.min(context.currentStepIndex + 1, context.steps.length - 1),
    }),
    decrementStep: assign({
      currentStepIndex: ({ context }) => Math.max(context.currentStepIndex - 1, 0),
    }),
    executeSetupActions: ({ context, self }) => {
      const currentStep = context.steps[context.currentStepIndex];
      console.log('[Tour] Executing setup actions for:', currentStep.id);
      
      if (currentStep.setupActions && currentStep.setupActions.length > 0) {
        currentStep.setupActions.forEach(action => {
          self._parent?.send({
            type: 'ROUTE_TOUR_EVENT',
            target: action.target,
            event: action.event
          });
        });
      }
    },
    completeTour: () => {
      // Same as endTour - mark tour as not started and show all plugins
      trpc.bus.send.mutate({
        systemId: 'settings',
        type: 'UPDATE_SETTINGS',
        entityType: 'internal',
        label: 'internal',
        path: ['tourStarted'],
        value: false,
      });
      
      // Show all plugins
      const allPlugins = ['threads', 'agent', 'code', 'library', 'actions', 'prompts', 'flows', 'brain', 'database', 'logs', 'blank'];
      const visibilityUpdate: Record<string, boolean> = {};
      allPlugins.forEach(plugin => {
        visibilityUpdate[plugin] = true;
      });
      visibilityUpdate['settings'] = true; // Settings should always be visible
      
      trpc.bus.send.mutate({
        systemId: 'settings',
        type: 'UPDATE_SETTINGS',
        entityType: 'plugin',
        label: '_meta',
        path: ['visibility'],
        value: visibilityUpdate,
      });
    },
  },
}).createMachine({
  id: 'guidedTour',
  initial: 'touring',
  context: {
    currentStepIndex: 0,
    steps: tourSteps,
  },
  states: {
    touring: {
      entry: ['executeSetupActions'],
      on: {
        NEXT: {
          actions: ['incrementStep', 'executeSetupActions'],
        },
        PREVIOUS: {
          actions: ['decrementStep', 'executeSetupActions'],
        },
        END: {
          target: 'ended',
          actions: 'completeTour',
        },
        COMPLETE: {
          target: 'completed',
          actions: 'completeTour',
        },
      },
    },
    ended: {
      type: 'final',
      entry: sendParent({ type: 'TOUR_ENDED' }),
    },
    completed: {
      type: 'final',
      entry: sendParent({ type: 'TOUR_COMPLETED' }),
    },
  },
});