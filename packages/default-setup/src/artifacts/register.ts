import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import {
  FileText, Code, CheckSquare, Image, MessageSquare, ListTodo,
  Layers, GitBranch, Wrench, Network, Table, ClipboardList,
  BookText, StickyNote, Bot,
} from 'lucide-vue-next';

export const standardArtifacts: ArtifactDefinition[] = [
  {
    type: 'text',
    fe: {
      icon: FileText,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/text-artifact.vue').default,
    },
  },
  {
    type: 'code',
    fe: {
      icon: Code,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/code-artifact.vue').default,
    },
  },
  {
    type: 'review',
    fe: {
      icon: CheckSquare,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/review-artifact.vue').default,
    },
  },
  {
    type: 'image',
    fe: {
      icon: Image,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/image-artifact.vue').default,
    },
  },
  {
    type: 'slack',
    fe: {
      icon: MessageSquare,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/slack-artifact.vue').default,
    },
  },
  {
    type: 'todo',
    fe: {
      icon: ListTodo,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/todo-artifact.vue').default,
    },
  },
  {
    type: 'project',
    fe: {
      icon: Layers,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/project-artifact.vue').default,
    },
  },
  {
    type: 'json',
    fe: {
      icon: FileText,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/json-artifact.vue').default,
    },
  },
  {
    type: 'graph',
    fe: { icon: Network },
  },
  {
    type: 'table',
    fe: { icon: Table },
  },
  {
    type: 'markdown',
    fe: {
      icon: BookText,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/markdown-artifact.vue').default,
    },
  },
  {
    type: 'claude-session',
    fe: {
      icon: Wrench,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/claude-session-artifact.vue').default,
    },
  },
  {
    type: 'codex-session',
    fe: {
      icon: Bot,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/codex-session-artifact.vue').default,
    },
  },
  {
    type: 'diff',
    fe: {
      icon: GitBranch,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/diff-artifact.vue').default,
    },
  },
  {
    type: 'plan',
    fe: {
      icon: ClipboardList,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/plan-artifact.vue').default,
    },
  },
  {
    type: 'note',
    fe: {
      icon: StickyNote,
      loadComponent: () => require('../plugins/threads/fe/canvas/agent/artifacts/types/note-artifact.vue').default,
    },
  },
];
