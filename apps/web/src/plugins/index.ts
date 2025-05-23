import Agent from './agent/plugin.ts';
import Threads from './threads/plugin.ts';
import Blank from './_blank/plugin.ts';
import type { Plugin } from '@/core/types/index.ts';
import { 
  Code, 
  Folder, 
  Brain,
  Sparkle,
  Workflow,
  Bird,
} from 'lucide-vue-next';

export function mockPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    ...Blank,
    isPinned: false,
    ...overrides,
  };
}

const mockPlugins = [
  mockPlugin({ id: 'brain', label: 'Brain', icon: Brain, }),
  mockPlugin({ id: 'dialog', label: 'Dialog', icon: Workflow, }),
  mockPlugin({ id: 'prompt', label: 'Prompt Builder', icon: Sparkle, }),
  mockPlugin({ id: 'files', label: 'Files', icon: Folder, }),
  mockPlugin({ id: 'code', label: 'Code', icon: Code, }),
  mockPlugin({ id: 'angel', label: 'Angel', icon: Bird, }),
];

export default [
  Threads,
  ...mockPlugins,
  Blank,
];

export const defaultPlugin = Agent;
