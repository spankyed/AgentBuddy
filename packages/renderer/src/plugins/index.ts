import Threads from './threads/plugin.ts';
import Flows from './flows/plugin.ts';
import Database from './database/plugin.ts';
import Brain from './brain/plugin.ts';
import Logs from './logs/plugin.ts';
import Prompts from './prompts/plugin.ts';
import Settings from './settings/plugin.ts';
import Actions from './actions/plugin.ts';
import Blank from './_blank/plugin.ts';
import Library from './library/plugin.ts';
import Code from './code/plugin.ts';
import Notes from './notes/plugin.ts';
import Browser from './browser/plugin.ts';
import Calendar from './calendar/plugin.ts';
import type { Plugin } from '@/core/types/index.ts';
import {
  Code as CodeIcon,
  AtSign,
  Sparkle,
  Workflow,
  Bird,
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

const mockPlugins: Plugin[] = [
  // wont do
  // mockPlugin({ id: 'dialog', label: 'Dialog Flows', icon: Workflow, }),
  // mockPlugin({ id: 'evals', label: 'Evals', icon: LandPlot, }),
  // mockPlugin({ id: 'includes', label: 'Includes', icon: AtSign, }),

  // planned
  // mockPlugin({ id: 'Todo', label: 'Todo', icon: ListTodo, }),
  // mockPlugin({ id: 'angel', label: 'Angel', icon: Bird, isPinned: true, }),
];

export default [
  Threads,
  Notes,
  Calendar,
  Browser,
  Code,
  Library,
  Flows,
  Actions,
  Prompts,
  Brain,
  Database,
  Logs,
  Settings,
  // Blank,
  ...mockPlugins,
];

export const defaultPlugin = Threads;
