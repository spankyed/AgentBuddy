import type { TiptapPlugin } from './injection-keys';

const plugins: TiptapPlugin[] = [];

export const tiptapPluginRegistry = {
  register(plugin: TiptapPlugin): void {
    plugins.push(plugin);
  },
  getAll(): TiptapPlugin[] {
    return plugins;
  },
};
