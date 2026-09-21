import type { PluginDefinition } from '@abuddy/sdk/fe';
import { StickyNote } from 'lucide-vue-next';
import state from './state';
import canvas from './canvas/list.vue';
import settings from './settings.vue';

const memosPlugin: PluginDefinition = {
  label: 'Memos',
  icon: StickyNote,
  state,
  canvas,
  settings,
};

export default memosPlugin;
