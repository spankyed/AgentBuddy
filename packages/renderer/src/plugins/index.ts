import Agent from './agent/plugin.ts';
import Threads from './threads/plugin.ts';
import Flows from './flows/plugin.ts';
import Database from './database/plugin.ts';
import Brain from './brain/plugin.ts';
import Logs from './logs/plugin.ts';
import Prompts from './prompts/plugin.ts';
import Actions from './actions/plugin.ts';
import Blank from './_blank/plugin.ts';
import Library from './library/plugin.ts';
import Code from './code/plugin.ts';
import type { Plugin } from '@/core/types/index.ts';
import { 
  Code as CodeIcon, 
  AtSign, 
  Sparkle,
  Workflow,
  Bird,
  Settings,
  ListTodo,
  Library as LucideLibrary,
  NotebookText,
  Play
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
  // wont do
  // mockPlugin({ id: 'dialog', label: 'Dialog Flows', icon: Workflow, }),
  // mockPlugin({ id: 'evals', label: 'Evals', icon: LandPlot, }),
  // mockPlugin({ id: 'includes', label: 'Includes', icon: AtSign, }),

  // planned
  // mockPlugin({ id: 'notes', label: 'Notes', icon: NotebookText, }),
  // mockPlugin({ id: 'Todo', label: 'Todo', icon: ListTodo, }),
  // mockPlugin({ id: 'angel', label: 'Angel', icon: Bird, isPinned: true, }),
  mockPlugin({ id: 'settings', label: 'settings', icon: Settings, isPinned: true, }),
];

export default [
  Threads,
  Agent,
  Code,
  Library,
  Actions,
  Prompts,
  Flows,
  Brain,
  Database,
  Logs,
  Blank,
  ...mockPlugins,
];

export const defaultPlugin = Agent;
