import Agent from './agent/plugin.ts';
import Threads from './threads/plugin.ts';
import Flows from './flows/plugin.ts';
import Database from './database/plugin.ts';
import Brain from './brain/plugin.ts';
import Blank from './_blank/plugin.ts';
import type { Plugin } from '@/core/types/index.ts';
import { 
  Code, 
  AtSign, 
  Sparkle,
  Workflow,
  Bird,
  ListTodo,
  NotebookText
} from 'lucide-vue-next';

export function mockPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    ...Blank,
    panel: undefined,
    isPinned: false,
    ...overrides,
  };
}

const mockPlugins = [
  // mockPlugin({ id: 'dialog', label: 'Dialog Flows', icon: Workflow, }),
  mockPlugin({ id: 'prompt', label: 'Prompt Builder', icon: Sparkle, }),
  mockPlugin({ id: 'includes', label: 'Includes', icon: AtSign, }),
  mockPlugin({ id: 'code', label: 'Code', icon: Code, }),
  mockPlugin({ id: 'notes', label: 'Notes', icon: NotebookText, }),
  mockPlugin({ id: 'Todo', label: 'Todo', icon: ListTodo, }),
  mockPlugin({ id: 'angel', label: 'Angel', icon: Bird, isPinned: true, }),
];

export default [
  Threads,
  Agent,
  Brain,
  Flows,
  Database,
  ...mockPlugins,
  Blank,
];

export const defaultPlugin = Agent;
