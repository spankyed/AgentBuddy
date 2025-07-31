import Agent from './agent/plugin.ts';
import Threads from './threads/plugin.ts';
import Flows from './flows/plugin.ts';
import Database from './database/plugin.ts';
import Brain from './brain/plugin.ts';
import Logs from './logs/plugin.ts';
import Blank from './_blank/plugin.ts';
import type { Plugin } from '@/core/types/index.ts';
import { 
  Settings,
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
  mockPlugin({ id: 'settings', label: 'settings', icon: Settings, isPinned: true, }),
];

// Core plugins only for Electron
export default [
  Threads,
  Agent,
  Flows,
  Brain,
  Database,
  Logs,
  Blank,
  ...mockPlugins,
];

export const defaultPlugin = Agent;