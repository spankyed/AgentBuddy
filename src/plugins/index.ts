import Panel from './agent/plugin.ts';
import Blank from './blank/plugin.ts';
import type { Plugin } from '@/helpers/types';
import { 
  Code, 
  Box, 
  Folder, 
  Brain,
  History,
  Sparkle,
  Workflow,
  Bird
} from 'lucide-vue-next';

export function mockPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    ...Blank,
    isPinned: false,
    ...overrides,
  };
}

const mockPlugins = [
  mockPlugin({ id: 'history', label: 'History', icon: History, }),
  mockPlugin({ id: 'dialog', label: 'Dialog', icon: Workflow, }),
  mockPlugin({ id: 'brain', label: 'Brain', icon: Brain, }),
  mockPlugin({ id: 'files', label: 'Files', icon: Folder, }),
  mockPlugin({ id: 'code', label: 'Code', icon: Code, }),
  mockPlugin({ id: 'components', label: 'Components', icon: Box, }),
  mockPlugin({ id: 'prompt', label: 'Prompt Builder', icon: Sparkle, }),
  mockPlugin({ id: 'angel', label: 'Angel', icon: Bird, }),
];

export default [
  ...mockPlugins,
  Blank,
];

export const defaultPlugin = Panel;
