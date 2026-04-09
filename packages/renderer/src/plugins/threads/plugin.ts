import type { Plugin } from "@/core/types/index.ts";
import { BotMessageSquare } from 'lucide-vue-next';
import state, { id } from './state.ts';
import list from './canvas/list.vue';
import kanban from './canvas/kanban.vue';
import ThreadDetail from './canvas/ThreadDetail.vue';
import AgentCanvas from './canvas/agent/canvas.vue';
import chat from './chat/chat.vue';
import settings from './settings.vue';

const threadsPlugin: Plugin = {
  id,
  label: 'Threads',
  icon: BotMessageSquare,
  state,
  canvas: {
    list,
    kanban,
    create: ThreadDetail,
    view: ThreadDetail,
    dashboard: AgentCanvas,
  },
  chat,
  settings,
  hotkeys: [
    {
      action: 'textToSpeech',
      global: false
    },
    {
      action: 'switchMode',
      global: true
    },
    {
      action: 'quickPrompts',
      global: true
    }
  ],
};

export default threadsPlugin;
