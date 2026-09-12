import type { Plugin } from '@abuddy/sdk/fe';
import { StickyNote } from 'lucide-vue-next';
import state, { id } from './state';
import canvas from './canvas/list.vue';

const memosPlugin: Plugin = {
  id,
  label: 'Memos',
  icon: StickyNote,
  state,
  canvas,
};

export default memosPlugin;
