import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import {
  FileText, Code, CheckSquare, Image, MessageSquare, ListTodo,
  Layers, GitBranch, Wrench, Network, Table, ClipboardList,
  BookText, StickyNote, Bot,
} from 'lucide-vue-next';

export const artifacts: ArtifactDefinition[] = [
  {
    type: 'text',
    fe: {
      icon: FileText,
      loadComponent: () => require('./viewers/text-artifact.vue').default,
    },
  },
  {
    type: 'code',
    fe: {
      icon: Code,
      loadComponent: () => require('./viewers/code-artifact.vue').default,
    },
  },
  {
    type: 'review',
    fe: {
      icon: CheckSquare,
      loadComponent: () => require('./viewers/review-artifact.vue').default,
    },
  },
  {
    type: 'image',
    fe: {
      icon: Image,
      loadComponent: () => require('./viewers/image-artifact.vue').default,
    },
  },
  {
    type: 'slack',
    fe: {
      icon: MessageSquare,
      loadComponent: () => require('./viewers/slack-artifact.vue').default,
    },
  },
  {
    type: 'todo',
    fe: {
      icon: ListTodo,
      loadComponent: () => require('./viewers/todo-artifact.vue').default,
    },
  },
  {
    type: 'project',
    fe: {
      icon: Layers,
      loadComponent: () => require('./viewers/project-artifact.vue').default,
    },
  },
  {
    type: 'json',
    fe: {
      icon: FileText,
      loadComponent: () => require('./viewers/json-artifact.vue').default,
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
      loadComponent: () => require('./viewers/markdown-artifact.vue').default,
    },
  },
  {
    type: 'claude-session',
    fe: {
      icon: Wrench,
      loadComponent: () => require('./viewers/claude-session-artifact.vue').default,
    },
  },
  {
    type: 'codex-session',
    fe: {
      icon: Bot,
      loadComponent: () => require('./viewers/codex-session-artifact.vue').default,
    },
  },
  {
    type: 'diff',
    fe: {
      icon: GitBranch,
      loadComponent: () => require('./viewers/diff-artifact.vue').default,
    },
  },
  {
    type: 'plan',
    fe: {
      icon: ClipboardList,
      loadComponent: () => require('./viewers/plan-artifact.vue').default,
    },
  },
  {
    type: 'note',
    fe: {
      icon: StickyNote,
      loadComponent: () => require('./viewers/note-artifact.vue').default,
    },
  },
];
