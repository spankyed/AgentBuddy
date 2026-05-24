import {productIntroFixture} from './product-intro';
import type {DemoFixture} from '../types';

const panels = {
  balanced: {canvasHeight: 58, inspectionWidth: 0, chatMaximized: false},
  chat: {canvasHeight: 18, inspectionWidth: 0, chatMaximized: false},
  canvas: {canvasHeight: 76, inspectionWidth: 0, chatMaximized: false},
};

export const cinematicProductDemoFixture: DemoFixture = {
  ...productIntroFixture,
  id: 'cinematic-product-demo',
  scenes: {
    ai_thread_stream: {
      pluginId: 'threads',
      threadView: 'dashboard',
      panelSizes: panels.chat,
      selectedArtifactId: 'artifact-plan',
    },
    thread_workspace: {
      pluginId: 'threads',
      threadView: 'dashboard',
      panelSizes: panels.balanced,
      selectedArtifactId: 'artifact-plan',
    },
    thread_kanban: {
      pluginId: 'threads',
      threadView: 'kanban',
      panelSizes: panels.canvas,
      selectedArtifactId: 'artifact-plan',
    },
    notes_editor: {
      pluginId: 'notes',
      panelSizes: panels.canvas,
    },
    notes_tasks: {
      pluginId: 'notes',
      panelSizes: panels.balanced,
    },
    code_changes: {
      pluginId: 'code',
      panelSizes: panels.canvas,
    },
    code_terminal: {
      pluginId: 'code',
      panelSizes: panels.chat,
    },
    branch_publish: {
      pluginId: 'code',
      panelSizes: panels.balanced,
    },
    workflow_graph: {
      pluginId: 'flows',
      targetView: 'dashboard',
      panelSizes: panels.canvas,
    },
    command_listener: {
      pluginId: 'actions',
      panelSizes: panels.canvas,
    },
    prompts_library: {
      pluginId: 'prompts',
      panelSizes: panels.canvas,
    },
    brain_system: {
      pluginId: 'brain',
      panelSizes: panels.canvas,
    },
    logs_stream: {
      pluginId: 'logs',
      panelSizes: panels.canvas,
    },
    database_memory: {
      pluginId: 'database',
      panelSizes: panels.canvas,
    },
    settings_personalization: {
      pluginId: 'settings',
      panelSizes: panels.canvas,
    },
    final_workspace: {
      pluginId: 'threads',
      threadView: 'dashboard',
      panelSizes: panels.balanced,
      selectedArtifactId: 'artifact-notes',
    },
  },
};
