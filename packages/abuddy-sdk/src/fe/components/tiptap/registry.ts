import type { TiptapPlugin } from './injection-keys';

const plugins: TiptapPlugin[] = [];

export const tiptapPluginRegistry = {
  register(plugin: TiptapPlugin, packId?: string): void {
    (plugin as any).__packId = packId;
    plugins.push(plugin);
  },
  unregisterAll(packId: string): void {
    for (let i = plugins.length - 1; i >= 0; i--) {
      if ((plugins[i] as any).__packId === packId) {
        plugins.splice(i, 1);
      }
    }
  },
  getAll(): TiptapPlugin[] {
    return plugins;
  },
};
