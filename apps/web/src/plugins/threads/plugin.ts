import type { Plugin } from "@/core/types/index.ts";
import { History } from 'lucide-vue-next';
import state, { id } from './state.ts';
import list from './canvas/list/list.vue';
import create from './canvas/create.vue';
import view from './canvas/view.vue';
import panel from './panel.vue';

const threadsPlugin: Plugin = {
  id,
  label: 'Threads',
  icon: History,
  state,
  canvas: {
    list,
    create,
    view,
  },
  panel,
};

export default threadsPlugin;