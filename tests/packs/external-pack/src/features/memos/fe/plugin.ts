import { definePlugin } from '@apackdev/sdk/fe';
import { StickyNote } from 'lucide-vue-next';
import { defineAsyncComponent } from 'vue';
import state from './state.ts';

const memosPlugin = definePlugin({
  label: 'Memos',
  icon: StickyNote,
  state,
  canvas: defineAsyncComponent(() => import('./canvas/list.vue')),
});

export default memosPlugin;
