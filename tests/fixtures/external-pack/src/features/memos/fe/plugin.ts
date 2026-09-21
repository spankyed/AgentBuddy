import type { PluginDefinition } from '@abuddy/sdk/fe';
import { StickyNote } from 'lucide-vue-next';
import state from './state';
import canvas from './canvas/list.vue';

const memosPlugin: PluginDefinition = {
  label: 'Memos',
  icon: StickyNote,
  state,
  canvas,
};

export default memosPlugin;
