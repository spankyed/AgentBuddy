import { setup, assign, sendParent, fromCallback, emit, sendTo } from 'xstate';
import { trpc } from '@/core/trpc';

export interface TourStep {
  id: string;
  targetId: string;
  title: string;
  content: string;
  action?: () => void;
  pluginId?: string;
  hideInspection?: boolean;
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
  },
  {
    id: 'toolbar',
    targetId: 'toolbar',
    title: 'Plugin Toolbar',
    content: 'This is the plugin toolbar. Each icon represents a different plugin you can use. Click on any icon to switch between plugins.',
  },
  {
    id: 'canvas',
    targetId: 'canvas-area',
    title: 'Canvas Area',
    content: 'The canvas is the main workspace where most plugins display their content. It adapts based on the active plugin.',
  },
  {
    id: 'chat',
    targetId: 'chat-area',
    title: 'Chat Area',
    content: 'This is where you interact with the AI assistant. Type messages, send commands, and receive responses here.',
  },
  {
    id: 'inspection',
    targetId: 'inspection-panel',
    title: 'Inspection Panel',
    content: 'The inspection panel shows contextual information like event traces from the brain. It may also display additional details or data from plugins.',
    hideInspection: false,
  },
  
  // Threads Plugin
  {
    id: 'threads-intro',
    targetId: 'plugin-threads',
    title: 'Threads Plugin',
    content: 'Now let\'s explore the Threads plugin. This helps you organize conversations into manageable threads.',
    pluginId: 'threads',
  },
  {
    id: 'threads-create',
    targetId: 'thread-create-button',
    title: 'Creating Threads',
    content: 'Click this button to create a new thread. You can customize the status, add tags, and link related threads.',
    pluginId: 'threads',
  },
  {
    id: 'threads-status',
    targetId: 'thread-status',
    title: 'Thread Status',
    content: 'Each thread has a status (Backlog, Open, In Progress, etc.). You can customize these in settings.',
    pluginId: 'threads',
  },
  {
    id: 'threads-actions',
    targetId: 'thread-actions',
    title: 'Thread Actions',
    content: 'Use these actions to delete threads or open them in the chat. The chat button switches to the Agent plugin.',
    pluginId: 'threads',
  },
  
  // Agent Plugin
  {
    id: 'agent-intro',
    targetId: 'plugin-agent',
    title: 'Agent Plugin',
    content: 'The Agent plugin is your main AI assistant interface. Let\'s explore its features.',
    pluginId: 'agent',
  },
  {
    id: 'agent-tabs',
    targetId: 'agent-thread-tabs',
    title: 'Thread Tabs',
    content: 'Each tab represents an open thread. Switch between conversations by clicking different tabs.',
    pluginId: 'agent',
  },
  {
    id: 'agent-artifacts',
    targetId: 'agent-artifacts',
    title: 'Artifacts',
    content: 'Artifacts are structured outputs separate from chat messages. They include todo lists, code files, diagrams, and more.',
    pluginId: 'agent',
  },
  {
    id: 'agent-chat',
    targetId: 'agent-chat-input',
    title: 'Chat Interface',
    content: 'Type your messages here to interact with the AI. The assistant can help with planning, coding, debugging, and more.',
    pluginId: 'agent',
  },
  {
    id: 'tour-complete',
    targetId: 'toolbar',
    title: 'Tour Complete!',
    content: 'You\'ve completed the guided tour! All plugins are now visible. Explore and customize AgentBuddy to fit your workflow.',
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
    executeStepAction: ({ context }, params?: any) => {
      const currentStep = context.steps[context.currentStepIndex];
      console.log('[Tour] Executing step action for:', currentStep.id);
      
      // Execute custom action if provided
      if (currentStep.action) {
        currentStep.action();
      }
    },
    switchToPlugin: sendParent(({ context }) => {
      const currentStep = context.steps[context.currentStepIndex];
      if (currentStep.pluginId) {
        console.log('[Tour] Switching to plugin:', currentStep.pluginId);
        return { type: 'SELECT_PLUGIN', pluginId: currentStep.pluginId };
      }
      return { type: 'NOOP' };
    }),
    toggleInspectionPanel: sendParent(({ context }) => {
      const currentStep = context.steps[context.currentStepIndex];
      if (currentStep.hideInspection !== undefined) {
        if (currentStep.hideInspection) {
          return { type: 'HIDE_INSPECTION_PANEL' };
        } else {
          return { type: 'SHOW_INSPECTION_PANEL' };
        }
      }
      return { type: 'NOOP' };
    }),
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
      entry: ['switchToPlugin', 'toggleInspectionPanel', 'executeStepAction'],
      on: {
        NEXT: {
          actions: ['incrementStep', 'switchToPlugin', 'toggleInspectionPanel', 'executeStepAction'],
        },
        PREVIOUS: {
          actions: ['decrementStep', 'switchToPlugin', 'toggleInspectionPanel', 'executeStepAction'],
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