import { tiptapPluginRegistry } from '@abuddy/sdk/fe/components/tiptap/registry';
import { tiptapPlugins } from './tiptap-plugins';

for (const plugin of tiptapPlugins) {
  tiptapPluginRegistry.register(plugin);
}
