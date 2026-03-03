import type { Plugin } from "@/core/types/index.ts";
import { History } from 'lucide-vue-next';
import state, { id } from './state.ts';
import list from './canvas/list.vue';
import kanban from './canvas/kanban.vue';
import ThreadDetail from './canvas/ThreadDetail.vue';
import settings from './settings.vue';

const threadsPlugin: Plugin = {
  id,
  label: 'Threads',
  icon: History,
  state,
  canvas: {
    list,
    kanban,
    create: ThreadDetail,
    view: ThreadDetail,
  },
  settings,
};

export default threadsPlugin;