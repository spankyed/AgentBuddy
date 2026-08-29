import { plugins, defaultPlugin } from '@/registries/plugins';
import Blank from './_blank/plugin.ts';
import type { Plugin } from '@/core/types/index.ts';

export function mockPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    ...Blank,
    panel: undefined,
    isPinned: false,
    ...overrides,
  };
}

const mockPlugins: Plugin[] = [];

export default [
  ...plugins,
  ...mockPlugins,
];

export { defaultPlugin };
